// WordReach server. Node 18+, no dependencies.
// AI: set GEMINI_API_KEY (free tier at aistudio.google.com) or ANTHROPIC_API_KEY.
//
//   Put your keys in a .env file (copy .env.example), then run:  npm start
//
// Storage:
//   - Default: a local JSON file (data/users.json). Zero setup, good for local demos.
//   - Hosted (recommended): set SUPABASE_URL and SUPABASE_SECRET_KEY (sb_secret_...) and create the
//     table in supabase.sql. Accounts then survive restarts and redeploys.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Load settings from a .env file next to this script, if there is one.
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = process.env.PORT || 3000;
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_BASE = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
// Gemini is used when GEMINI_API_KEY is set (or AI_PROVIDER=gemini); otherwise Claude.
const PROVIDER = (process.env.AI_PROVIDER || (GEMINI_KEY ? "gemini" : "anthropic")).toLowerCase();
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
// Vercel only allows writing to /tmp (temporary). Use Supabase for permanent accounts there.
const DATA_FILE = path.join(process.env.DATA_DIR || (process.env.VERCEL ? "/tmp/wordreach" : path.join(__dirname, "data")), "users.json");
const html = () => fs.readFileSync(path.join(__dirname, "index.html"));

if (PROVIDER === "gemini" ? !GEMINI_KEY : !KEY) console.warn(`Warning: ${PROVIDER === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"} is not set. AI features will fail.`);
console.log("AI provider:", PROVIDER === "gemini" ? `Gemini (${GEMINI_MODEL})` : `Claude (${MODEL})`);
if (!process.env.SESSION_SECRET) console.warn("Warning: SESSION_SECRET is not set. Everyone is signed out on restart.");
console.log("Storage:", SB_URL && SB_KEY ? "Supabase" : `local file (${DATA_FILE})`);

// ---------- Storage ----------
const fileStore = {
  read() { try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return {}; } },
  write(all) { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); const tmp = DATA_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(all)); fs.renameSync(tmp, DATA_FILE); },
  async get(email) { return this.read()[email] || null; },
  async create(u) { const all = this.read(); if (all[u.email]) return false; all[u.email] = u; this.write(all); return true; },
  async setData(email, data) { const all = this.read(); if (!all[email]) return; all[email].data = data; this.write(all); }
};
const sbStore = {
  h(extra = {}) {
    // New sb_secret_ keys go in the apikey header only. Legacy JWT service_role keys also need Authorization.
    const auth = SB_KEY.startsWith("eyJ") ? { Authorization: `Bearer ${SB_KEY}` } : {};
    return { apikey: SB_KEY, ...auth, "Content-Type": "application/json", ...extra };
  },
  async get(email) {
    const r = await fetch(`${SB_URL}/rest/v1/wr_users?email=eq.${encodeURIComponent(email)}&select=*`, { headers: this.h() });
    if (!r.ok) throw new Error("db read failed");
    const rows = await r.json(); return rows[0] || null;
  },
  async create(u) {
    const r = await fetch(`${SB_URL}/rest/v1/wr_users`, { method: "POST", headers: this.h({ Prefer: "return=minimal" }), body: JSON.stringify(u) });
    if (r.status === 409) return false;
    if (!r.ok) throw new Error("db write failed");
    return true;
  },
  async setData(email, data) {
    const r = await fetch(`${SB_URL}/rest/v1/wr_users?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: this.h({ Prefer: "return=minimal" }), body: JSON.stringify({ data }) });
    if (!r.ok) throw new Error("db write failed");
  }
};
const store = SB_URL && SB_KEY ? sbStore : fileStore;

// ---------- Crypto helpers ----------
function hash(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(secret, salt, 64).toString("hex");
}
function verify(secret, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  const a = Buffer.from(h, "hex"), b = crypto.scryptSync(secret, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const b64 = s => Buffer.from(s).toString("base64url");
function signSession(email) {
  const body = b64(JSON.stringify({ e: email, x: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  return body + "." + crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}
function readSession(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)wr_s=([^;]+)/);
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const s = JSON.parse(Buffer.from(body, "base64url").toString()); return s.x > Date.now() ? s.e : null; } catch { return null; }
}
function cookie(req, value, maxAge) {
  const secure = (req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  return `wr_s=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---------- Abuse protection ----------
const fails = new Map(); // email -> { n, until }
function locked(email) { const f = fails.get(email); return f && f.until > Date.now(); }
function fail(email) { const f = fails.get(email) || { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = Date.now() + 10 * 60 * 1000; f.n = 0; } fails.set(email, f); }
const aiHits = new Map(); // ip -> [timestamps]
function aiLimited(ip) { const now = Date.now(), arr = (aiHits.get(ip) || []).filter(t => now - t < 3600e3); arr.push(now); aiHits.set(ip, arr); return arr.length > 120; }

// ---------- AI providers ----------
async function askClaude(prompt, image) {
  if (!KEY) return { error: "ANTHROPIC_API_KEY is not set on the server." };
  const content = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: image } });
  content.push({ type: "text", text: prompt });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages: [{ role: "user", content }] })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.error?.message || `Claude error ${r.status}` };
  return { text: (j.content || []).filter(b => b.type === "text").map(b => b.text).join("") };
}
async function askGemini(prompt, image) {
  if (!GEMINI_KEY) return { error: "GEMINI_API_KEY is not set on the server." };
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: "image/png", data: image } });
  parts.push({ text: prompt });
  const generationConfig = { maxOutputTokens: 2048, temperature: 0.6 };
  // 2.5 Flash "thinks" by default; turning it off keeps answers fast for live use.
  if (/^gemini-2\.5-flash/.test(GEMINI_MODEL)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const r = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.error?.message || `Gemini error ${r.status}` };
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!text) return { error: `Gemini returned no text (${j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || "unknown reason"}).` };
  return { text };
}

// ---------- HTTP ----------
function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad json")); } });
    req.on("error", reject);
  });
}
function send(res, code, obj, headers = {}) { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(obj)); }
const publicUser = u => ({ email: u.email, name: u.name, forName: u.for_name });
const validEmail = e => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200;
const validPin = p => Array.isArray(p) && p.length === 3 && p.every(n => Number.isInteger(n) && n >= 0 && n < 9);

http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  try {
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html());
    }

    if (req.method === "POST" && url === "/api/signup") {
      const { name, forName, email: raw, password, pin } = await readBody(req);
      const email = String(raw || "").trim().toLowerCase();
      if (!validEmail(email)) return send(res, 400, { error: "Please enter a valid email." });
      if (typeof password !== "string" || password.length < 8) return send(res, 400, { error: "Password needs at least 8 characters." });
      if (!validPin(pin)) return send(res, 400, { error: "Please choose 3 pictures for the picture PIN." });
      const user = { email, name: String(name || "").slice(0, 80), for_name: String(forName || "").slice(0, 80), pass_hash: hash(password), pin_hash: hash(pin.join("-")), data: {} };
      if (!(await store.create(user))) return send(res, 409, { error: "An account with this email already exists." });
      return send(res, 200, { user: publicUser(user) }, { "Set-Cookie": cookie(req, signSession(email), 2592000) });
    }

    if (req.method === "POST" && url === "/api/login") {
      const { email: raw, password, pin } = await readBody(req);
      const email = String(raw || "").trim().toLowerCase();
      if (locked(email)) return send(res, 429, { error: "Too many tries. Please wait 10 minutes and try again." });
      const u = await store.get(email);
      const ok = u && (password ? verify(password, u.pass_hash) : validPin(pin) && verify(pin.join("-"), u.pin_hash));
      if (!ok) { fail(email); return send(res, 401, { error: pin ? "Those pictures don't match. Try again." : "Email or password is incorrect." }); }
      fails.delete(email);
      return send(res, 200, { user: publicUser(u) }, { "Set-Cookie": cookie(req, signSession(email), 2592000) });
    }

    if (req.method === "POST" && url === "/api/logout") return send(res, 200, { ok: true }, { "Set-Cookie": cookie(req, "", 0) });

    if (url === "/api/me" || url === "/api/state") {
      const email = readSession(req);
      const u = email && (await store.get(email));
      if (!u) return send(res, 401, { error: "Not signed in" });
      if (url === "/api/me") return send(res, 200, { user: publicUser(u) });
      if (req.method === "GET") return send(res, 200, { data: u.data || {} });
      if (req.method === "PUT") {
        const { data } = await readBody(req, 1024 * 1024);
        if (typeof data !== "object" || data === null) return send(res, 400, { error: "bad data" });
        await store.setData(email, data); return send(res, 200, { ok: true });
      }
    }

    if (req.method === "POST" && url === "/api/ai") {
      if (aiLimited(ip)) return send(res, 429, { error: "Too many requests. Please slow down." });
      const { prompt, image } = await readBody(req);
      if (typeof prompt !== "string" || !prompt || prompt.length > 20000) return send(res, 400, { error: "prompt required" });
      const img = typeof image === "string" && image ? image : null;
      const out = PROVIDER === "gemini" ? await askGemini(prompt, img) : await askClaude(prompt, img);
      if (out.error) return send(res, 502, { error: out.error });
      return send(res, 200, { text: out.text });
    }

    res.writeHead(404); res.end("Not found");
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Something went wrong. Please try again." });
  }
}).listen(PORT, () => console.log(`WordReach on http://localhost:${PORT}`));
