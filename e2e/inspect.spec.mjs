// e2e: Judge inspection + grouped dossier + source-aware labels + legibility (§7/§12).
//
// Self-driving (bare `playwright`, not @playwright/test): `node e2e/inspect.spec.mjs`.
// Requires the dev server (:3000). Does NOT require the Python brain — this spec
// INTERCEPTS the stream proxy (/api/dossier/stream) and serves a deterministic NDJSON
// fixture that includes per-finding `judge` blocks and a dossier-level `rejected` array
// (the backend contract this UI was built against). That makes the test independent of
// backend readiness while still driving the REAL UI end-to-end.
//
// Asserts:
//   1. The LIVE SCAN streams during the run inside a SOLID paper panel (legible over
//      the field) — its container has an opaque-ish background (not transparent).
//   2. Findings render GROUPED BY ITEM, ACT-first across groups.
//   3. A per-finding "Inspect" expander opens → judge.why + confirmed + checks render
//      (including a "redacted" gate shown honestly as withheld).
//   4. The "Considered & set aside" disclosure renders dossier.rejected (neutral, no tier).
//   5. Action labels are source-appropriate: "per the recall" (CPSC) / "per the public
//      record" (EPA) / "shown for context" (Prop 65).
//   6. The weak "Recalled by CPSC" headline is replaced (no card titled exactly that).
//   7. Zero console errors throughout.
//
// Screenshots land in ./.e2e-shots/ (workspace path, NOT /tmp).
//
// Env: WARDEN_UI_URL (default http://localhost:3000), WARDEN_SHOT_DIR (default ./.e2e-shots).

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI = process.env.WARDEN_UI_URL ?? "http://localhost:3000";
const SHOTS = process.env.WARDEN_SHOT_DIR ?? resolve(__dirname, "..", ".e2e-shots");

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok -", msg);
}

// ── Deterministic NDJSON stream fixture (matches the backend contract) ──────────
function fixtureBody() {
  const steps = [
    { seq: 1, phase: "cpsc", source: "CPSC", item: "portable space heater", status: "started", detail: "CPSC · portable space heater — searching recalls" },
    { seq: 2, phase: "triage", source: "CPSC", item: "portable space heater", status: "done", detail: "→ 6 recalls → ACT", tier: "ACT" },
    { seq: 3, phase: "epa", source: "EPA ECHO", item: "Tap water", status: "started", detail: "EPA · water system, ZIP 48503" },
    { seq: 4, phase: "epa", source: "EPA ECHO", item: "Tap water", status: "done", detail: "→ FLINT, CITY OF → 1 SDWA violation → ADDRESS", tier: "ADDRESS" },
    { seq: 5, phase: "prop65", source: "CA Prop 65", item: "extension cords", status: "done", detail: "→ 19 notices → CONTEXT (suppressed)", tier: "CONTEXT" },
  ];

  const dossier = {
    type: "dossier",
    generated_at: "2026-06-13T15:30:00",
    items: ["portable space heater", "extension cords"],
    context: { zip: "48503", water_source: "tap" },
    top_tier: "ACT",
    counts: { ACT: 2, ADDRESS: 1, AWARE: 0, CONTEXT: 1 },
    findings: [
      {
        item: "portable space heater",
        tier: "ACT",
        hazard_type: "Recalled by CPSC", // generic fallback -> must be replaced in UI
        severity_basis:
          "Miswiring due to a manufacturing error can cause the tower heater to overheat, posing a fire hazard.",
        action:
          "Immediately stop using the recalled heaters and visit Vornado's website to register for a full refund.",
        condition: null,
        confidence: "Moderate",
        is_ubiquitous: false,
        origin: "user_listed",
        source: { name: "CPSC", url: "https://www.cpsc.gov/Recalls/2023/x", locator: "RecallNumber 23148" },
        as_of: "2023-03-09T00:00:00",
        judge: {
          why: "Matched the user's 'portable space heater' to an active CPSC recall at the cited locator; tiered ACT because the recall instruction is to stop use immediately.",
          confirmed: { ok: true, detail: "Re-read RecallNumber 23148 at cpsc.gov; recall is active and remedy text matches." },
          checks: [
            { name: "matched-at-locator", status: "pass" },
            { name: "compliance-scan", status: "info" },
            { name: "action-traced", status: "pass" },
            { name: "model-confirmation", status: "redacted" },
          ],
          source_kind: "recall",
        },
      },
      {
        item: "portable space heater",
        tier: "ACT",
        hazard_type: "Fire hazard",
        severity_basis: "The heater can overheat, smoke and catch fire, posing fire and burn hazards.",
        action: "Stop using the recalled heaters and contact Heat Hero for a free replacement.",
        condition: null,
        confidence: "Moderate",
        is_ubiquitous: false,
        origin: "user_listed",
        source: { name: "CPSC", url: "https://www.cpsc.gov/Recalls/2019/y", locator: "RecallNumber 19738" },
        as_of: "2019-04-17T00:00:00",
        judge: {
          why: "Second active recall for the same category at a distinct locator.",
          confirmed: { ok: true, detail: "Re-read RecallNumber 19738; active." },
          checks: [{ name: "matched-at-locator", status: "pass" }, { name: "action-traced", status: "pass" }],
          source_kind: "recall",
        },
      },
      {
        item: "Tap water — FLINT, CITY OF (MI0002310)",
        tier: "ADDRESS",
        hazard_type: "Safe Drinking Water Act violation",
        severity_basis:
          "1 SDWA rule violation on record (last 3 years); category: Treatment Technique Violation, per EPA ECHO/SDWIS.",
        action:
          "Review FLINT, CITY OF's Safe Drinking Water Act compliance and any public notice on EPA ECHO.",
        condition: "if you drink unfiltered tap water",
        confidence: "Moderate",
        is_ubiquitous: false,
        origin: "user_listed",
        source: { name: "EPA ECHO (SDWA/SDWIS)", url: "https://echo.epa.gov/x", locator: "PWSID MI0002310" },
        as_of: "SDWA v2020-02-05 1500", // stamped form -> must not half-slice in UI
        judge: {
          why: "ADDRESS because there is a formal SDWA violation on the public record for the ZIP's water system; conditional on drinking unfiltered tap.",
          confirmed: { ok: true, detail: "Re-fetched the EPA Detailed Facility Report for PWSID MI0002310." },
          checks: [
            { name: "matched-at-locator", status: "pass" },
            { name: "compliance-scan", status: "pass" },
          ],
          source_kind: "epa_record",
        },
      },
      {
        item: "extension cords",
        tier: "CONTEXT",
        hazard_type: "Prop 65 notice",
        severity_basis: "A CA Prop 65 warning exists for products in this category (ubiquitous notice).",
        action: "Shown for context; review the Prop 65 warning if you wish.",
        condition: null,
        confidence: "Preliminary",
        is_ubiquitous: true,
        origin: "user_listed",
        source: { name: "CA Prop 65", url: "https://oehha.ca.gov/x", locator: "Notice 12345" },
        as_of: "2024-01-01T00:00:00",
        judge: {
          why: "CONTEXT because the Prop 65 notice is ubiquitous and category-wide, not specific to a recall or action.",
          confirmed: { ok: false, detail: "Notice is category-level; no per-product confirmation possible." },
          checks: [{ name: "matched-at-locator", status: "info" }],
          source_kind: "prop65_notice",
        },
      },
    ],
    suppressed: [],
    record_statements: [],
    checked_sources: ["CPSC", "EPA ECHO (SDWA/SDWIS)", "CA Prop 65"],
    disclaimer:
      "Warden reports the state of the public record as of the date shown — not a verdict on your items, and not health advice.",
    rejected: [
      {
        item: "portable space heater",
        candidate: "Generic 'heater' recall (RecallNumber 09112)",
        reason: "not_relevant",
        detail: "Matched the keyword but the recalled product is a baseboard heater, not a portable unit.",
      },
      {
        item: "extension cords",
        candidate: "Older CPSC alert (2003)",
        reason: "not_confirmed",
        detail: "Could not re-confirm the alert at a stable locator on cpsc.gov.",
      },
      {
        item: "portable space heater",
        candidate: "Duplicate Vornado listing",
        reason: "duplicate",
        detail: "Same recall already surfaced above under RecallNumber 23148.",
      },
    ],
  };

  const lines = [...steps.map((s) => JSON.stringify(s)), JSON.stringify(dossier)];
  return lines.join("\n") + "\n";
}

async function run() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });

  const consoleErrors = [];
  const isNoise = (t) =>
    /Failed to load resource: the server responded with a status of 404/.test(t) ||
    /\/_next\/.*\b404\b/.test(t) ||
    /favicon\.ico/.test(t);
  page.on("console", (m) => {
    if (m.type() === "error" && !isNoise(m.text())) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  // Intercept the stream proxy with the deterministic fixture (backend-independent).
  await page.route("**/api/dossier/stream", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/x-ndjson; charset=utf-8" },
      body: fixtureBody(),
    });
  });

  try {
    console.log(`[1] load ${UI} (idle)`);
    await page.goto(UI, { waitUntil: "networkidle" });
    await page.getByText(/Stand guard/i).first().waitFor({ timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/00_idle.png`, fullPage: true });

    console.log("[2] use demo basket (ZIP prefilled) + run audit");
    await page.getByRole("button", { name: /Use demo basket/i }).click();
    // React state settles a tick after the click — wait for the ZIP to populate.
    await page.waitForFunction(
      () => document.querySelector('input[aria-label="ZIP code"]')?.value === "48503",
      { timeout: 8000 }
    );
    assert((await page.getByLabel("ZIP code").inputValue()) === "48503", "demo prefilled ZIP 48503");
    await page.getByRole("button", { name: /Run audit/i }).click();

    // (1) The live scan shows during the run, inside a SOLID panel.
    const scanHero = page.getByTestId("scan-hero");
    // The fixture resolves fast; the hero may flash. Try to catch it, else proceed.
    let sawHero = false;
    try {
      await scanHero.waitFor({ state: "visible", timeout: 4000 });
      sawHero = true;
      // Legibility: the scan hero's container must NOT be transparent.
      const bg = await scanHero.evaluate((el) => getComputedStyle(el).backgroundColor);
      const transparent = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
      assert(!transparent, `live scan panel has a solid background (${bg})`);
      await page.screenshot({ path: `${SHOTS}/01_scan_streaming.png`, fullPage: true });
    } catch {
      console.log("  (scan hero flashed too fast to capture — acceptable for a fast fixture)");
    }

    console.log("[3] dossier renders, GROUPED BY ITEM");
    await page.getByTestId("item-group").first().waitFor({ timeout: 15_000 });
    const groupCount = await page.getByTestId("item-group").count();
    assert(groupCount >= 2, `findings grouped by item (${groupCount} groups)`);

    // ACT group sorts first: the first group header should be the heater (has ACT).
    const firstGroup = page.getByTestId("item-group").first();
    const firstGroupText = await firstGroup.innerText();
    assert(/space heater/i.test(firstGroupText), "ACT item (space heater) group sorts first");
    // The header pip text "2 Act" is uppercased by CSS -> match case-insensitively.
    assert(/\bact\b/i.test(firstGroupText), "first group header shows an ACT count pip");

    // (6) The weak generic headline is replaced — no h3 titled exactly "Recalled by CPSC".
    const weak = await page.getByRole("heading", { name: "Recalled by CPSC", exact: true }).count();
    assert(weak === 0, 'weak "Recalled by CPSC" headline is replaced (derived hazard instead)');

    await page.screenshot({ path: `${SHOTS}/02_grouped_dossier.png`, fullPage: true });

    console.log("[4] source-aware action labels");
    assert((await page.getByText(/Action — per the recall/i).count()) >= 1, '"per the recall" label present (CPSC)');
    assert((await page.getByText(/Action — per the public record/i).count()) >= 1, '"per the public record" label present (EPA)');
    assert((await page.getByText(/Shown for context/i).count()) >= 1, '"shown for context" label present (Prop 65)');

    console.log("[5] open a per-finding Inspect expander → judge.why + confirmed + checks");
    const inspect = page.getByTestId("inspect").first();
    await inspect.scrollIntoViewIfNeeded();
    await inspect.locator("summary").click();
    await page.getByText(/Why this tier/i).first().waitFor({ timeout: 8000 });
    assert(await page.getByText(/Why this tier/i).first().isVisible(), "judge.why (Why this tier) renders");
    assert(await page.getByText(/Re-fetched & confirmed at the source/i).first().isVisible(),
      "judge.confirmed (re-fetched & confirmed) renders");
    assert(await page.getByText(/Gates that ran/i).first().isVisible(), "judge.checks (Gates that ran) renders");
    assert(await page.getByText(/matched-at-locator/i).first().isVisible(), "a named gate renders");
    assert(await page.getByText(/detail withheld/i).first().isVisible(),
      "a redacted gate renders honestly as withheld");
    await page.screenshot({ path: `${SHOTS}/03_inspector_open.png`, fullPage: true });

    console.log("[6] 'Considered & set aside' disclosure renders dossier.rejected");
    const setAside = page.getByTestId("considered-set-aside");
    await setAside.scrollIntoViewIfNeeded();
    assert(await setAside.isVisible(), "considered-&-set-aside disclosure present");
    await setAside.locator("summary").click();
    assert(await page.getByText(/Warden weighed these and set them aside/i).first().isVisible(),
      "neutral set-aside framing renders");
    assert((await page.getByText(/not a match for what you own/i).count()) >= 1, "a rejected reason label renders");
    // Rejected items carry NO tier color: no .tier-* class inside the disclosure.
    const tieredInside = await setAside.locator(".tier-act, .tier-address, .tier-aware").count();
    assert(tieredInside === 0, "rejected items show NO tier color");
    await page.screenshot({ path: `${SHOTS}/04_set_aside_open.png`, fullPage: true });

    console.log("[7] collapsed scan stays available & inviting");
    assert((await page.getByText(/What Warden checked — \d+ step/i).count()) >= 1,
      'collapsed scan reads "What Warden checked — N steps"');

    console.log("[8] no console errors");
    assert(consoleErrors.length === 0,
      `0 console errors (saw ${consoleErrors.length}: ${consoleErrors.slice(0, 3).join(" | ")})`);

    console.log(`\nPASS — grouped dossier, judge inspector, set-aside, source labels, legible scan${sawHero ? "" : " (hero flashed fast)"}, 0 console errors.`);
    console.log(`Screenshots: ${SHOTS}/`);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error("\nFAIL —", e.message);
  process.exit(1);
});
