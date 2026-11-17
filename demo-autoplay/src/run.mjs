// Autoplay demo: drives the REAL intentpay UI with Playwright and (optionally) records a video.
// Usage:  node src/run.mjs [--record] [--no-sandbox (only for root/CI containers)] [--scene A] [--headless] [--with-e] [--channel chrome] [--no-mp4]
import { chromium } from "playwright";
import { mkdirSync, renameSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { settings as cfg, hold, story, captions, purchaseBefore, purchaseAfter } from "./beats.mjs";
import { overlayInit } from "./overlay.mjs";
import { loadScenes } from "./scenes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../out");

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i < 0) return undefined;
  return argv[i].includes("=") ? argv[i].split("=")[1] : argv[i + 1];
};
const RECORD = flag("record");
const HEADLESS = flag("headless");
const ONLY_SCENE = opt("scene");
const CHANNEL = opt("channel") ?? process.env.DEMO_CHANNEL;
if (flag("with-e")) cfg.includeSceneE = true;
if (flag("no-mp4")) cfg.makeMp4 = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BANK = cfg.bankUrl;
const NET = cfg.networkUrl;

// ---------- failure naming ----------
let currentStep = "start";
async function step(label, fn) {
  currentStep = label;
  try { return await fn(); }
  catch (e) { throw new Error(`Step "${label}" failed: ${String(e.message ?? e).split("\n")[0]}`); }
}

// ---------- API helpers (the same endpoints the /demo page calls) ----------
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function preChecks() {
  try { await fetch(BANK + "/api/agent/summary"); }
  catch { throw new Error(`The app is not reachable on ${BANK}. Start it first:  cd intentpay && npm run dev`); }
  try { await fetch(NET + "/agents"); }
  catch { throw new Error(`The simulated card network is not reachable on ${NET}. Start it first:  cd network && node server.mjs`); }
}

async function resetDemo() {
  const r = await api("POST", BANK + "/api/demo/reset");
  if (!r.ok) throw new Error(`Reset demo failed (HTTP ${r.status}): ${r.data?.error ?? "unknown error"}`);
  if (r.data?.networkReset === false) throw new Error("Reset demo cleared the bank but could not reach the network. Start the network (node server.mjs) and retry.");
  const s = (await api("GET", BANK + "/api/agent/summary")).data;
  const names = (s.registry ?? []).map((a) => a.name).sort().join(",");
  if (names !== "ChatGPT,Gemini,Perplexity") throw new Error(`After reset the agents are "${names}", expected ChatGPT, Gemini and Perplexity.`);
  if (s.overall?.spentCents !== 24000 || s.overall?.limitCents !== 30000) {
    throw new Error(`After reset the overall cap shows ${s.overall?.spentCents}/${s.overall?.limitCents} cents; expected 24000/30000.`);
  }
}

async function findPolicy(agent, category, kind) {
  const s = (await api("GET", BANK + "/api/agent/summary")).data;
  const mine = (s.agents ?? []).filter((a) => a.agentName === agent && (!category || a.category === category));
  const p = mine.find((a) => a.status === "ACTIVE") ?? (kind === undefined || kind === "buy" ? mine[0] : undefined);
  if (!p) throw new Error(`${agent} has no ${category ?? ""} mandate. The demo data does not look seeded.`);
  return p;
}

// Same payloads the /demo page builds in runStep.
async function purchase(s, policy) {
  const r = await api("POST", BANK + "/api/demo/purchase", {
    policyId: policy.id, merchant: s.merchant, category: s.category, amount: s.amount,
    description: s.description, lineItems: s.lineItems, fixedAmount: s.fixedAmount, spoof: s.spoof,
  });
  if (!r.ok) throw new Error(`Purchase request failed: ${r.data?.error ?? "HTTP " + r.status}`);
  return r.data;
}
async function revoke(policy, kind) {
  const r = await api("POST", BANK + "/api/demo/revoke", { policyId: policy.id, mode: kind === "netcancel" ? "network_only" : "bank" });
  if (!r.ok) throw new Error(`Revoke request failed: ${r.data?.error ?? "HTTP " + r.status}`);
}

// ---------- browser ----------
async function launch() {
  const base = { headless: HEADLESS, slowMo: cfg.slowMo, timeout: 30000, ...(flag("no-sandbox") ? { chromiumSandbox: false } : {}) };
  const chain = CHANNEL ? [{ channel: CHANNEL }] : [{}, { channel: "chrome" }, { channel: "msedge" }];
  const errors = [];
  for (const c of chain) {
    try { return await chromium.launch({ ...base, ...c }); }
    catch (e) { errors.push(`${c.channel ?? "bundled chromium"}: ${String(e.message).split("\n")[0]}`); }
  }
  throw new Error(`Could not start a browser.\n  ${errors.join("\n  ")}\nInstall one with:  npx playwright install chromium   (or install Google Chrome / Microsoft Edge)`);
}

let page;
const url = (p) => BANK + p;

async function overlayReady() {
  await page.waitForFunction(() => window.__demo && window.__demo.ready(), null, { timeout: cfg.waitMs });
}
async function go(p) {
  await page.goto(url(p), { waitUntil: "domcontentloaded" });
  await overlayReady();
}
async function caption(text) {
  await overlayReady();
  await page.evaluate((t) => window.__demo.caption(t), text ?? "");
}
const pause = (ms) => page.waitForTimeout(ms);

// Scroll so the target sits comfortably between the top and the caption bar (smooth, visible in the video).
async function reveal(loc) {
  await loc.waitFor({ state: "visible", timeout: cfg.waitMs });
  const vh = cfg.viewport.height;
  const box = await loc.boundingBox();
  if (box && (box.y < 70 || box.y + Math.min(box.height, 200) > vh - 150)) {
    await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await pause(750);
  }
}
async function glide(loc, { fx = 0.5, fy = 0.5 } = {}) {
  await reveal(loc);
  const box = await loc.boundingBox();
  if (!box) throw new Error("target has no size on screen");
  const x = box.x + box.width * fx, y = box.y + Math.min(box.height, 120) * fy;
  await overlayReady();
  await page.evaluate(([x, y, ms]) => window.__demo.move(x, y, ms), [x, y, cfg.glideMs]);
  await pause(cfg.glideMs + 80);
}
async function click(loc) {
  await glide(loc);
  await page.evaluate(() => window.__demo.click());
  await loc.click({ timeout: cfg.waitMs });
}
async function typeInto(loc, text, { replace = false } = {}) {
  await click(loc);
  if (replace) await loc.press("ControlOrMeta+a");
  await loc.pressSequentially(text, { delay: cfg.typeDelay });
}
async function choose(loc, label) {
  await glide(loc);
  await page.evaluate(() => window.__demo.click());
  await loc.selectOption({ label });
  await pause(400);
}
const D = (name) => page.locator(`[data-demo="${name}"]`);
const firstRow = () => D("activity-row").first();

// Wait for the REAL Cards screen to show the newest activity row for this result.
async function waitForRow(merchant, outcome) {
  await page.waitForFunction(
    ([m, o]) => {
      const r = document.querySelector('[data-demo="activity-row"]');
      return !!r && r.getAttribute("data-merchant") === m && r.getAttribute("data-outcome") === o;
    },
    [merchant, outcome],
    { timeout: cfg.waitMs, polling: 250 },
  );
}

// ---------- segments ----------
async function home() {
  await step("home: open the Home screen", async () => {
    await go("/");
    await D("home-agent-row").waitFor({ timeout: cfg.waitMs });
    await page.waitForFunction(() => {
      const r = document.querySelector('[data-demo="home-agent-row"]');
      return !!r && /\$\d/.test(r.innerText) && /agents? ·/.test(r.innerText);
    }, null, { timeout: cfg.waitMs, polling: 250 });
    await caption(captions.home); await pause(hold.medium);
  });
  await step("home: tap the Agent Payment Control row", async () => {
    await click(D("home-agent-row"));
    await D("overall-cap").waitFor({ timeout: cfg.waitMs });
  });
}

async function intro() {
  const c = captions.intro;
  await step("intro: open Cards screen", async () => {
    if (!new URL(page.url()).pathname.startsWith("/agent")) await go("/agent");
    else await overlayReady();
    await D("overall-cap").waitFor({ timeout: cfg.waitMs });
    for (const n of ["ChatGPT", "Gemini", "Perplexity"]) await D(`agent-${n}`).waitFor({ timeout: cfg.waitMs });
    await caption(c[0]); await pause(hold.long);
  });
  await step("intro: overall cap", async () => {
    await caption(c[1]);
    await glide(D("overall-cap")); await pause(hold.medium);
  });
  await step("intro: the three agents", async () => {
    await caption(c[2]);
    for (const n of ["ChatGPT", "Gemini", "Perplexity"]) { await glide(D(`agent-${n}`), { fy: 0.15 }); await pause(hold.short); }
  });
}

async function claude() {
  const c = captions.claude;
  await step("claude: register from the verified picker", async () => {
    await go("/agent");
    await caption(c.register);
    await glide(D("agent-registry")); await pause(hold.short);
    await choose(D("registry-select"), "Claude");
    await click(D("registry-register"));
    await D("agent-Claude").waitFor({ timeout: cfg.waitMs });
    await D("agent-Claude").locator('[data-demo="verified-badge"]').waitFor({ timeout: cfg.waitMs });
  });
  await step("claude: show verified badge", async () => {
    await caption(c.registered);
    await glide(D("agent-Claude"), { fy: 0.2 }); await pause(hold.medium);
  });
  await step("claude: open Add mandate", async () => {
    await caption(c.newMandate);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await pause(700);
    await click(D("add-mandate"));
    await D("new-agent-select").waitFor({ timeout: cfg.waitMs });
    await choose(D("new-agent-select"), "Claude");
  });
  await step("claude: pick a goal", async () => {
    await caption(c.pickGoal);
    await click(D("goal-Weekly groceries"));
    await D("prompt").waitFor({ timeout: cfg.waitMs });
  });
  await step("claude: type the sentence", async () => {
    await caption(c.typing);
    await typeInto(D("prompt"), "Groceries at Woolworths, max $50 a week, no gift cards or alcohol", { replace: true });
    await pause(hold.beat);
  });
  await step("claude: Fill in the rules for me", async () => {
    await caption(c.fill);
    await click(D("fill-rules"));
    await page.waitForFunction(() => {
      const i = document.querySelector('[data-demo="rule-limit"]');
      const b = document.querySelector('[data-demo="fill-rules"]');
      return !!i && i.value !== "" && !!b && !b.disabled;
    }, null, { timeout: cfg.waitMs, polling: 200 });
  });
  await step("claude: review the pre-filled form", async () => {
    await caption(c.review);
    await glide(D("rule-merchant")); await pause(hold.medium);
    await glide(D("rule-limit")); await pause(hold.short);
    await click(D("review"));
    await D("confirm-summary").waitFor({ timeout: cfg.waitMs });
  });
  await step("claude: plain-English confirm screen", async () => {
    await caption(c.confirmScreen);
    await glide(D("confirm-summary")); await pause(hold.long);
    await click(D("confirm"));
    await D("view-cards").waitFor({ timeout: cfg.waitMs });
    await pause(hold.short);
  });
  await step("claude: show the new card", async () => {
    await click(D("view-cards"));
    await D("agent-Claude").waitFor({ timeout: cfg.waitMs });
    await page.waitForFunction(
      () => { const e = document.querySelector('[data-demo="agent-Claude"]'); return !!e && !/No mandates yet/.test(e.innerText); },
      null, { timeout: cfg.waitMs, polling: 250 },
    );
    await caption(c.created);
    await glide(D("agent-Claude"), { fy: 0.2 }); await pause(hold.long);
  });
  await step("claude: Claude makes a payment inside the mandate", async () => {
    const policy = await findPolicy("Claude", undefined, "buy");
    await caption(c.pays); await pause(hold.short);
    const r = await purchase({ agent: "Claude", merchant: "Woolworths", category: policy.category, amount: 20 }, policy);
    await waitForRow("Woolworths", r.outcome);
    await glide(firstRow()); await pause(hold.medium);
  });
}

async function playScene(id, plan) {
  const defs = SCENES[id];
  if (!defs) throw new Error(`Scene ${id} is not defined in intentpay/app/demo/page.tsx`);
  const bt = captions.scenes[id] ?? { steps: {} };
  await step(`scene ${id}: open Cards screen`, async () => {
    await go("/agent");
    await D("overall-cap").waitFor({ timeout: cfg.waitMs });
    await caption(bt.intro ?? defs.title); await pause(hold.short);
  });
  const idxs = plan.only ?? defs.steps.map((_, i) => i);
  for (const i of idxs) {
    const s = defs.steps[i];
    if (!s) throw new Error(`Scene ${id} has no step ${i}; edit "only" in beats.mjs`);
    const ov = bt.steps?.[i] ?? {};
    const label = `scene ${id}, step ${i + 1} (${s.kind ?? "buy"}: ${s.agent} ${s.merchant})`;

    if (s.kind === "netcancel" || s.kind === "bankrevoke") {
      await step(`${label}: caption`, async () => { await caption(ov.before ?? s.note); await pause(hold.short); });
      await step(`${label}: call`, async () => {
        const policy = await findPolicy(s.agent, s.category, s.kind);
        await revoke(policy, s.kind);
      });
      await step(`${label}: wait for the Cards screen`, async () => {
        if (s.kind === "bankrevoke") {
          const sec = D(`agent-${s.agent}`);
          await reveal(sec);
          await page.waitForFunction((n) => {
            const e = document.querySelector(`[data-demo="agent-${n}"]`);
            return !!e && /Revoked/.test(e.innerText);
          }, s.agent, { timeout: cfg.waitMs, polling: 250 });
          await glide(sec, { fy: 0.3 });
        }
        await caption(ov.after ?? s.note); await pause(hold.medium);
      });
      continue;
    }

    await step(`${label}: caption`, async () => {
      await caption(ov.before ?? purchaseBefore(s)); await pause(hold.short);
    });
    const result = await step(`${label}: call purchase endpoint`, async () => {
      const policy = await findPolicy(s.agent, s.category, "buy");
      return purchase(s, policy);
    });
    await step(`${label}: wait for the result in the Cards screen`, async () => {
      await waitForRow(s.merchant, result.outcome);
      if (result.outcome === "ask_customer") await D("pending-approval").first().waitFor({ timeout: cfg.waitMs });
      await caption(ov.after ?? purchaseAfter(s, result));
      await glide(result.outcome === "ask_customer" ? D("pending-approval").first() : firstRow());
      await pause(hold.medium);
    });
    if (result.outcome === "ask_customer" && bt.approve?.includes(i)) {
      await step(`${label}: customer taps Approve`, async () => {
        await caption(bt.approveNote);
        await click(D("pending-approve").first());
        await D("pending-approval").first().waitFor({ state: "detached", timeout: cfg.waitMs });
        await caption(bt.approvedNote); await pause(hold.medium);
      });
    }
    if (plan.receiptOnStep === i) await openReceipt(id, bt);
  }
}

async function openReceipt(id, bt) {
  await step(`scene ${id}: open the receipt`, async () => {
    await caption(bt.receipt);
    const link = firstRow().locator('[data-demo="view-receipt"]');
    await click(link);
    await D("timeline").waitFor({ timeout: cfg.waitMs });
    await pause(hold.medium);
    await glide(D("timeline"), { fy: 0.05 });
    await pause(hold.long);
    await page.evaluate(() => window.scrollBy({ top: 320, behavior: "smooth" })); await pause(hold.long);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await overlayReady();
    await D("overall-cap").waitFor({ timeout: cfg.waitMs });
  });
}

async function outro() {
  await step("outro", async () => {
    await go("/agent");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await pause(600);
    await caption(captions.outro); await pause(hold.long + 1500);
    await caption("");
  });
}

// ---------- main ----------
let SCENES;
async function main() {
  mkdirSync(OUT, { recursive: true });
  SCENES = loadScenes();
  await step("pre-checks", preChecks);
  await step("reset demo", resetDemo);

  let plan = story.filter((s) => !s.optional || (s.id === "E" && cfg.includeSceneE));
  if (ONLY_SCENE) {
    const id = ONLY_SCENE.length === 1 ? ONLY_SCENE.toUpperCase() : ONLY_SCENE.toLowerCase();
    const found = story.find((s) => s.id === id) ?? (SCENES[id] ? { id } : null);
    if (!found) throw new Error(`Unknown scene "${ONLY_SCENE}". Use A-F, home, intro, claude or outro.`);
    plan = [found];
  }

  const browser = await step("launch browser", launch);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const tmpVideoDir = path.join(OUT, `.tmp-${stamp}`);
  const ctx = await browser.newContext({
    viewport: cfg.viewport,
    deviceScaleFactor: cfg.deviceScaleFactor,
    ...(RECORD ? { recordVideo: { dir: tmpVideoDir, size: { width: cfg.viewport.width * cfg.videoScale, height: cfg.viewport.height * cfg.videoScale } } } : {}),
  });
  await ctx.addInitScript(overlayInit);
  page = await ctx.newPage();
  page.setDefaultTimeout(cfg.waitMs);
  const started = Date.now();
  let failure = null;

  try {
    let first = true;
    for (const seg of plan) {
      if (seg.id === "home") await home();
      else if (seg.id === "intro") await intro();
      else if (seg.id === "claude") await claude();
      else if (seg.id === "outro") await outro();
      else {
        if (!first && cfg.resetBetweenScenes) {
          await step(`reset before scene ${seg.id}`, async () => {
            await caption(captions.resetNote);
            await resetDemo();
            await pause(hold.short);
          });
        }
        await playScene(seg.id, seg);
      }
      first = false;
    }
  } catch (e) {
    failure = e;
    try { await page.screenshot({ path: path.join(OUT, `failure-${stamp}.png`) }); } catch {}
  } finally {
    const video = RECORD ? page.video() : null;
    await ctx.close();
    await browser.close();
    if (video) {
      const src = await video.path();
      const name = `intentpay-demo-${stamp}${ONLY_SCENE ? "-scene-" + ONLY_SCENE : ""}`;
      const dest = path.join(OUT, `${name}.webm`);
      renameSync(src, dest);
      try { spawnSyncRm(tmpVideoDir); } catch {}
      console.log(`Video saved: ${dest}  (${Math.round((Date.now() - started) / 1000)}s)`);
      if (cfg.makeMp4) {
        const mp4 = dest.replace(/\.webm$/, ".mp4");
        const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", dest, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", mp4]);
        if (r.status === 0) console.log(`MP4 saved:   ${mp4}`);
        else console.log("(ffmpeg not found or failed, so no .mp4. The .webm plays in Chrome, VLC and most editors.)");
      }
    }
    // Always leave the demo in its seeded state.
    try { await resetDemo(); console.log("Demo data restored to the seeded state."); }
    catch (e) { console.error(`WARNING: could not restore the seeded state: ${e.message}. Press Reset demo on the /demo page.`); }
  }
  if (failure) throw failure;
}

function spawnSyncRm(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) { try { statSync(path.join(dir, f)); } catch {} }
  spawnSync(process.platform === "win32" ? "cmd" : "rm", process.platform === "win32" ? ["/c", "rmdir", "/s", "/q", dir] : ["-rf", dir]);
}

main().then(() => { console.log("Demo finished."); }).catch((e) => {
  console.error(`\nDEMO FAILED\n${e.message}\n(Last step: ${currentStep})`);
  process.exitCode = 1;
});
