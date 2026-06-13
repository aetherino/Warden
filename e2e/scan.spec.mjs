// e2e: Live agentic scan (rubric §12 / Gate 13) + ZIP-input gap (#036).
//
// Drives the live UI at http://localhost:3000 headless and asserts:
//   1. Entering a demo item + ZIP 48503, running the audit, shows a LIVE SCAN LOG
//      with streaming step events (rubric §12) — not a static loader.
//   2. An EPA ADDRESS finding surfaces (the ZIP is wired through context, #036).
//   3. The final ranked dossier renders (ACT lead) and the scan log stays available.
//   4. Zero console errors throughout.
//
// This project uses the bare `playwright` package (not @playwright/test), so this is a
// self-driving script: `node e2e/scan.spec.mjs`. Requires the dev server (:3000) and the
// Python brain (:8787) to be running. Screenshots land in /tmp/warden_scan/.
//
// Env overrides: WARDEN_UI_URL (default http://localhost:3000), WARDEN_SHOT_DIR.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const UI = process.env.WARDEN_UI_URL ?? "http://localhost:3000";
const SHOTS = process.env.WARDEN_SHOT_DIR ?? "/tmp/warden_scan";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok -", msg);
}

async function run() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });

  const consoleErrors = [];
  // Ignore dev-server transients (HMR / static-chunk 404s during recompile) that a
  // production build never emits; still catch any REAL app/runtime error.
  const isNoise = (t) =>
    /Failed to load resource: the server responded with a status of 404/.test(t) ||
    /\/_next\/.*\b404\b/.test(t) ||
    /favicon\.ico/.test(t);
  page.on("console", (m) => {
    if (m.type() === "error" && !isNoise(m.text())) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  try {
    console.log(`[1] load ${UI}`);
    await page.goto(UI, { waitUntil: "networkidle" });
    assert(await page.getByText("What do you", { exact: false }).first().isVisible(),
      "intake heading visible");

    console.log("[2] enter a demo item + ZIP 48503 + tap-water toggle (#036)");
    await page.locator("textarea").fill("portable space heater");
    await page.getByLabel("ZIP code").fill("48503");
    await page.getByText("I drink unfiltered tap water").click();
    assert((await page.getByLabel("ZIP code").inputValue()) === "48503", "ZIP field holds 48503");

    console.log("[3] run audit -> live scan log streams real step events");
    await page.getByRole("button", { name: /Run audit/i }).click();

    // The live scan log appears (NOT the old static "Checking the public record" loader).
    // It is now the HERO of the loading state — a solid framed panel headed "Checking…".
    const scanLog = page.getByTestId("scan-log");
    await scanLog.waitFor({ state: "visible", timeout: 15_000 });
    await page.getByTestId("scan-hero").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText(/Checking/i).first().waitFor({ timeout: 15_000 });

    // Wait until >=2 streamed step events have rendered (proof of live streaming), then shoot.
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="scan-log"]');
      if (!el) return false;
      // step rows are the font-mono lines inside the log's scroll area
      return el.querySelectorAll(".font-mono").length >= 3;
    }, { timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/01_streaming.png`, fullPage: true });
    const cpscStep = await page.getByText(/CPSC|recall|triaging|→ ACT|cached/i).first().isVisible();
    assert(cpscStep, "a CPSC/triage step event rendered in the live log");

    console.log("[4] wait for the final dossier to render");
    // The counts ledger ("Act"/"Address" stat labels) marks the rendered dossier.
    await page.getByText("Act", { exact: true }).first().waitFor({ timeout: 90_000 });

    // ACT lead card (heater) — the loud lead headline is a Fire/Shock hazard.
    const actChip = page.locator(".tier-act").first();
    await actChip.waitFor({ timeout: 10_000 });
    assert(await actChip.isVisible(), "ACT tier finding rendered (heater)");

    // #036: the EPA ADDRESS finding surfaced because the ZIP was wired through context.
    const epaAddress = page.getByText(/Safe Drinking Water Act|SDWA|PWSID|Tap water/i).first();
    await epaAddress.waitFor({ timeout: 10_000 });
    assert(await epaAddress.isVisible(), "EPA ADDRESS finding surfaced (ZIP 48503 -> Flint)");
    const addressTier = await page.locator(".tier-address").count();
    assert(addressTier >= 1, "an ADDRESS-tiered element is present");

    // The scan stays available, collapsed AND inviting, after the dossier renders (§12).
    const collapsed = page.getByText(/What Warden checked — \d+ step/i).first();
    assert(await collapsed.isVisible(), "collapsed scan log stays available after dossier renders");

    await page.screenshot({ path: `${SHOTS}/02_final_dossier.png`, fullPage: true });

    console.log("[5] no console errors");
    assert(consoleErrors.length === 0,
      `0 console errors (saw ${consoleErrors.length}: ${consoleErrors.slice(0, 3).join(" | ")})`);

    console.log("\nPASS — live scan streamed, EPA ADDRESS surfaced via ZIP, dossier rendered, 0 console errors.");
    console.log(`Screenshots: ${SHOTS}/01_streaming.png , ${SHOTS}/02_final_dossier.png`);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error("\nFAIL —", e.message);
  process.exit(1);
});
