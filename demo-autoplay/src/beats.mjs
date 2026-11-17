// ─────────────────────────────────────────────────────────────────────────────
// BEATS: every caption, hold time and setting for the autoplay demo lives here.
// Edit this file to change the story; nothing else needs to change.
// Times are milliseconds. Captions are shown in the on-screen bar, one at a time.
// ─────────────────────────────────────────────────────────────────────────────

export const settings = {
  bankUrl: "http://localhost:3000",
  networkUrl: "http://localhost:4000",
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  videoScale: 1,        // 1 = 430x932 video, 2 = 860x1864 (sharper, much bigger file, slower)
  slowMo: 120,          // Playwright slows every action by this much (ms)
  typeDelay: 40,        // ms per key when typing into real inputs
  glideMs: 650,         // how long the cursor takes to glide to a target
  waitMs: 15000,        // max wait for any real UI state before failing the step
  resetBetweenScenes: true, // the /demo page says "Reset first" for every scene, so we do too
  makeMp4: true,        // also write an .mp4 next to the .webm if ffmpeg is installed
  includeSceneE: false, // fixed vs flexible; also switchable with --with-e
};

// Hold times (how long a result stays on screen so it can be read).
export const hold = { beat: 900, short: 1600, medium: 2600, long: 4200 };

// Scene order for the full story. A scene id here maps to the scene on the /demo page
// (definitions are read from intentpay/app/demo/page.tsx so they cannot drift).
// "only" picks which of that scene's steps to play (0-based). Omit it to play all of them.
export const story = [
  { id: "intro" },
  { id: "claude" },
  { id: "A", only: [0, 2] },
  { id: "B", only: [0, 1] },
  { id: "D", only: [3] },
  { id: "F", only: [0, 2] },
  { id: "C", receiptOnStep: 4 },
  { id: "E", optional: true },
  { id: "outro" },
];

export const captions = {
  intro: [
    "AI agents are about to spend your money. Card networks check each token, but only your bank sees all of them.",
    "One overall cap protects you across every agent.",
    "ChatGPT, Gemini and Perplexity: each with its own mandates.",
  ],
  claude: {
    register: "A new agent arrives. The card network, not the bank, says who it is.",
    registered: "Claude is registered and verified by the network (simulated).",
    newMandate: "Now give Claude a mandate: what it may spend, and where.",
    pickGoal: "Start from a goal...",
    typing: "...then describe it in plain English.",
    fill: "The bank turns the sentence into rules.",
    review: "Check every rule before anything is created.",
    confirmScreen: "A plain-English summary. Nothing happens until you confirm.",
    created: "Claude has its card. It can only spend inside this mandate.",
    pays: "Claude pays Woolworths $20: inside the mandate, so it goes through.",
  },
  resetNote: "New demo week: data reset so every scene starts from the same seed.",
  // Per scene: intro line, optional per-step overrides ("before"/"after"; index = step index in the scene).
  scenes: {
    A: {
      intro: "Scene A: the overall cap wins.",
      steps: {
        0: { after: "Gemini's own budget has room, but the overall cap does not. Cut to what is left." },
        2: { before: "A different agent, same cap: ChatGPT tries to book a $100 flight.", after: "Declined. No single token could see this." },
      },
    },
    B: {
      intro: "Scene B: new merchants and lookalikes.",
      steps: {
        0: { after: "A merchant the bank has never seen goes to the customer, not straight through." },
        1: { before: "Then a lookalike of Coles: 'Cooles' for $20.", after: "Declined. Lookalikes are blocked outright." },
      },
      approve: [0], // steps where the script taps Approve in the real UI
      approveNote: "The customer taps Approve in the real app.",
      approvedNote: "Approved by the customer. Every other rule still applies.",
    },
    D: {
      intro: "Scene D: the AI check.",
      steps: {
        3: { after: "AI can only make decisions stricter. The rules decide." },
      },
    },
    F: {
      intro: "Scene F: a spoofed agent.",
      steps: {
        0: { before: "Someone holds ChatGPT's card token and pretends to be ChatGPT.", after: "Blocked at the network: it cannot sign as ChatGPT. The bank still records the attempt." },
        2: { before: "Now the real ChatGPT, correctly signed.", after: "Approved." },
      },
    },
    C: {
      intro: "Scene C: cancel at the network vs revoke at the bank.",
      steps: {
        1: { before: "Cancel the instruction at the network only...", after: "The card already issued keeps working." },
        2: { after: "Still approved. The network cancel did not stop the issued card." },
        3: { before: "Now revoke at the bank.", after: "Revoked. The bank will refuse the very next payment." },
        4: { after: "Blocked immediately. Open the receipt to see why." },
      },
      receipt: "The receipt: who delegated, which rule fired, the token, and the timeline.",
    },
    E: {
      intro: "Scene E: fixed price vs flexible.",
      steps: {},
    },
  },
  outro: "The network checks the transaction. The bank protects the customer across all their agents.",
};

// Default captions for a purchase step when the scene gives no override.
export const purchaseBefore = (s) => `${s.agent} tries to pay ${s.merchant} $${s.amount}`;
export const purchaseAfter = (s, r) => {
  const money = (n) => `$${Number(n).toFixed(0)}`;
  switch (r.outcome) {
    case "approve": return `Approved: ${money(s.amount)} to ${s.merchant}.`;
    case "approve_narrower": return `Approved ${money(r.approved_amount ?? 0)} of ${money(s.amount)}: reduced to fit.`;
    case "ask_customer": return "Held: the bank asks the customer first.";
    case "decline": return `Declined${r.declined_by === "network" ? " by the network" : ""}.`;
    default: return "Done.";
  }
};
