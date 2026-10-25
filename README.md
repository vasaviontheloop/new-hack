# WordReach

**You know the word. Let's find it together.**

An AI word-finding assistant for people with aphasia. Theme 3: Beyond the Screen, Build for a Smarter, More Inclusive Future.

## The problem
Aphasia is a language disorder, usually after a stroke. The person's intelligence is intact, but the words won't come out. The NAA puts it at 2M+ people in the US, more common than Parkinson's, and about a third of stroke survivors get it. Word-finding trouble (anomia) is the most common symptom across all types.

Most AAC apps give you a fixed grid of preset words. That works for "water" and "toilet", but not for the word you actually need in the moment. And guessing games with family are slow and tiring.

## What WordReach does
1. **Give clues any way you can:** tap a category, what it's used for, where it lives, the size, a first sound, type broken bits, or **sketch it**.
2. **AI guesses** 6 likely words, built to expect aphasia errors (misspellings, related-word swaps like "fork" for "spoon", wrong first letters).
3. **AI asks one yes/no question** to narrow it down. Tapping Yes or No is low-effort.
4. Mark guesses **No** or **Close** ("it's near this"), and each round gets sharper.
5. When found: **Say it** (text to speech), **Help me say it** (cue ladder: first sound, then syllables, then the whole word, a standard speech-therapy cueing technique), **Show someone** (full-screen card), and **4 ready-made sentences** to use the word right away.
6. **My world (personal word profile):** family adds the people, places, foods, things and pets in the person's life once. The AI checks these first and marks matches "From my world", so typing "A person" + "dau" surfaces the daughter's actual name, not just "daughter". It also gives a small boost to words found before.
7. **Daily practice:** 5-word sessions built from the person's own world and saved words (common everyday words fill any gaps). They try to say each word out loud, and hints step up from the first sound, to half the word, to the whole word, the same order speech therapists use for cueing. Words that needed more help come back more often. It runs without the AI, so it still works if the API is down.
8. **Accounts:** a carer signs up with email and password (hashed with scrypt, never stored in plain text). The person with aphasia signs in with a **picture PIN**: they tap 3 pictures in order, no typing or reading needed. Carer and person share ONE account: the carer uses the password, the person uses the pictures. Once the carer signs in on the person's device, it remembers them, and from then on the sign-in screen just says "Hi Ramesh, tap your 3 pictures" with no email, no typing and nothing to read ("Not Ramesh?" and "Carer sign-in" links sit underneath). My world, saved words and practice history sync to the account, so they follow the person across devices. Five wrong attempts lock sign-in for 10 minutes. A **Try the demo** button skips sign-in with an example profile.
9. **Progress:** words found, average time to find, practice sessions, and a chart of words said without help per session, so family or a therapist can see change over time.

Design: editorial look (Instrument Serif headings, line icons, ink and deep-green palette) with accessibility built in: Atkinson Hyperlegible body font, 50px+ touch targets, an icon plus a short label on every option, low reading load, keyboard focus states, reduced-motion support.

## Run it on a laptop (recommended for the demo)
1. Install **Node.js 18 or newer** from nodejs.org (the LTS version).
2. Unzip the project. In the folder, copy `.env.example` to a new file named `.env` and paste your Anthropic key into it.
3. Open a terminal in the folder and run `npm start`.
4. Open **http://localhost:3000** in Chrome.

No database needed: accounts are saved in `data/users.json` on the laptop. The laptop needs internet for the AI.

## Deploy (Render + Supabase, both free)
Hosted servers can wipe local files on restart, so the hosted version should keep accounts in Supabase.

1. **Supabase:** create a free project at supabase.com. Open **SQL Editor**, paste `supabase.sql`, and click **Run**. Then copy the **Project URL** (from the **Connect** button or Settings → Data API), and in **Settings → API Keys** copy a **Secret key** (it starts with `sb_secret_`).
2. **GitHub:** upload these files to a new repo.
3. **Render:** New → Web Service → pick the repo. Build command `npm install`, start command `npm start`, Free plan.
4. Under **Environment**, add:
   - `ANTHROPIC_API_KEY`: your Anthropic key
   - `SESSION_SECRET`: any long random text (keeps people signed in across restarts)
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_SECRET_KEY`: the `sb_secret_...` key
5. Deploy. Keep every key secret: they go only in Render's Environment settings, never in GitHub.

Free Render services sleep after 15 minutes idle, so open the site a few minutes before judging.

Inside a Claude artifact, the page uses Claude's built-in model access. Accounts are switched off there, and **Try the demo** works.

## 3-minute demo script
1. "Imagine my father had a stroke. He wants something from the kitchen and can't say the word."
2. Show the **Hi Ramesh** picture sign-in ("One account for the family. The carer uses a password; Ramesh just taps sun, star, apple. No typing, no reading."). Sign in, or tap **Try the demo**, which loads an example profile.
3. Tap **A person**, type "dau", tap **Find my word**. Point out that "Priya" comes first, marked **From my world**. "Generic apps would say 'daughter'. WordReach knows her name."
4. Start over. Tap **Food or drink**, then **Kitchen**, type "yello" and sketch a curved shape. Tap **Find my word**.
5. Answer the yes/no question. Mark one guess **Close**. Show how the next round improves.
6. Tap **That's it**. Then **Help me say it** three times (first sound, parts, whole word), tap a sentence, then **Show someone**.
7. Open **Practice**, do two words (one on your own, one with hints). Show the summary.
8. Close on **Progress** and the chart. "It doesn't just find words. It helps people get them back."

## Responsible design
Not a medical device and not a replacement for speech therapy. The partner panel teaches communication tips and flags sudden word-finding trouble as a possible stroke sign. Passwords and PINs are hashed, sessions are signed HttpOnly cookies, the database table is locked to the server only, and sign-in locks after repeated failures. Demo mode keeps everything on the device.

## Sources
- National Aphasia Association, "How common is aphasia?" https://aphasia.org/faq-list/how-common-is-aphasia/
- ASHA, "Aphasia: Relatively Unknown but Common" (2022) https://www.asha.org/news/2022/aphasia-relatively-unknown-but-common/
- Georgetown CARR, Anomia https://carr.georgetown.edu/about-aphasia/anomia
- Cleveland Clinic, Anomic aphasia https://my.clevelandclinic.org/health/diseases/anomic-aphasia
