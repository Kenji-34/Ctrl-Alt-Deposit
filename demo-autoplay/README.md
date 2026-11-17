# demo-autoplay

Drives the **real** intentpay UI with Playwright (nothing is mocked or faked) and can record the run as a video.
Agent purchases, which don't exist in the bank UI, are triggered by calling the same endpoints the `/demo` page calls, and the scene definitions are read straight from `intentpay/app/demo/page.tsx`, so they can't drift. Results are then shown in the real Cards screen and receipt page.

The app is unchanged apart from `data-demo="..."` attributes (and `Card` in `ui.tsx` passing one through).

## Setup (once)
```
cd demo-autoplay
npm install
npx playwright install ffmpeg        # needed for video recording
npx playwright install chromium      # or skip this if Google Chrome / Edge is installed; it is used as a fallback
```
Start the app and network first (two terminals):
```
cd intentpay && npm run dev
cd network && node server.mjs
```

## Commands
```
npm run demo:play                     # headed, watch it, no recording
npm run demo:record                   # records; saves .webm (+ .mp4 if ffmpeg is on PATH) to demo-autoplay/out/
npm run demo:record -- --scene A      # retake one scene (A-F, or intro, claude, outro)
```
Other flags: `--headless`, `--with-e` (adds Scene E, fixed vs flexible), `--channel chrome|msedge` (force an installed browser), `--no-mp4`, `--no-sandbox` (only for root/CI containers).

## Editing the story
Everything (captions, hold times, which scene steps play, typing speed, viewport, slowMo) is in **`src/beats.mjs`**.

## What it does
Starts with Reset demo (checks the seed: $240 of $300 spent, ChatGPT/Gemini/Perplexity), runs: Cards overview, register Claude from the verified picker, create a mandate by typing, Scenes A, B (with a real tap on Approve), D (one step), F, C (network cancel vs bank revoke, then the receipt), closing caption. About 3 to 3.5 minutes.
Between scenes it resets the demo data (the `/demo` page says "Reset first" for each scene), so **Claude disappears after the first reset**; that is why Claude pays Woolworths $20 right after its card is created. Turn this off with `resetBetweenScenes: false` in beats.mjs (later scenes then start from whatever is left of the cap).
When it ends, or fails, it resets to the seeded state again. A fresh browser profile is used every run.

## If it fails
It prints `Step "<name>" failed: ...`, saves `out/failure-<time>.png`, and still restores the seeded state.
