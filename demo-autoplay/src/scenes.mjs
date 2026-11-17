// Reads the scene definitions straight out of the app's /demo page so the autoplay can never drift
// from what the page does. Nothing in the app is changed or imported at runtime.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_PAGE = path.resolve(here, "../../intentpay/app/demo/page.tsx");

export function loadScenes(file = DEMO_PAGE) {
  let src;
  try { src = readFileSync(file, "utf8"); }
  catch { throw new Error(`Cannot read the scene definitions at ${file}. Run this from a checkout where intentpay/ sits next to demo-autoplay/.`); }
  const start = src.indexOf("const SCENES");
  const end = src.indexOf("type Result");
  if (start < 0 || end < 0) throw new Error("Could not find `const SCENES` ... `type Result` in intentpay/app/demo/page.tsx. The page layout changed; update demo-autoplay/src/scenes.mjs.");
  let block = src.slice(start, end).trim();
  const eq = block.indexOf("= [");
  block = block.slice(eq + 2).replace(/;\s*$/, ""); // the array literal only (drops the TS type annotation)
  const scenes = new Function(`"use strict"; return (${block});`)();
  return Object.fromEntries(scenes.map((s) => [s.id, s]));
}
