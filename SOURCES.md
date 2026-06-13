# SOURCES.md — Warden Data-Source Reference

> Authoritative recon reference for the Warden build (compiled 2026-06-13 from per-source recon profiles).
> Pairs with `rubric.md` (gates), `ISSUES.md` (tasks/state), `brain.md` (living context).
>
> **How to read this file.** Each source section states: what tier it feeds, how to access it, auth, the
> exact endpoints + example requests, how the response maps onto the dossier schema, the **stable-citation
> strategy** (§3: every finding needs a re-fetchable `source.url` + `source.locator` that pins the fact),
> rate limits, joins, and gotchas. **Every place a recon profile was marked `inferred` / `uncertain` /
> `UNVERIFIED` is called out in a 🚩 RE-VERIFY box — the builder MUST re-confirm against the live source
> before relying on it.**
>
> **Dossier schema reminder (per finding):**
> `{item, tier: ACT|ADDRESS|AWARE|CONTEXT, hazard_type, severity_basis, action, condition?, confidence?, is_ubiquitous: bool, source:{name,url,locator}, origin: "user_listed"|"curated_pathway"|"ai_inferred", discovery?}`
> `origin` is REQUIRED, non-null, default `user_listed`. When `origin != "user_listed"`, `discovery{}` (the pathway-level receipt) is REQUIRED **in addition to** `source{}` (the finding-level §3 receipt) — an `ai_inferred` finding carries TWO citations and BOTH must re-fetch 200 (Gate 12).
>
> **§3 confirmation is mechanical, not a soft grade:** cited URL returns 200 AND `hazard_type` + the item identifier appear in the fetched content at/near the locator; otherwise the finding is dropped to `rejected.json`.

---

## Source-at-a-glance

| # | Source | Primary tier(s) | Access | Auth | Citation stability | Live-verified? |
|---|--------|-----------------|--------|------|--------------------|----------------|
| 1 | CPSC Product Recalls (SaferProducts.gov REST) | **ACT** | REST API | none | Strong | ✅ verified live |
| 2 | EPA ECHO SDWA REST + SDWIS bulk | **ADDRESS** (+AWARE, +CONTEXT per-violation) | REST + bulk CSV | none | Strong (DFR fid + VIOLATION_ID) | ✅ verified live |
| 3 | EPA PFAS/UCMR 5 + ECHO/FRS facilities | **CONTEXT** (§11 discovery) (+ADDRESS/AWARE for a PWSID) | bulk text + REST | none | Strong (UCMR composite key; FRS RegistryID) | ✅ ECHO verified; ⚠️ FRS live UNVERIFIED |
| 4 | CA Prop 65 — OEHHA list + AG 60-day notices | **CONTEXT** (`is_ubiquitous` backbone) (+ADDRESS/AWARE enforcement) | mixed (file dl + HTML/CSV) | none (read) | Strong for AG notices; OEHHA list = revision-dated | ✅ verified; ⚠️ OEHHA Incapsula-gated |
| 5 | Independent confidence layer — Exa + OpenAlex + Semantic Scholar | §7 confidence/evidence-tier ONLY (never ACT/ADDRESS) | REST API | **api_key (all 3)** | Strong via DOI | ✅ OpenAlex verified; S2/Exa need keys |
| 6 | FDA/USDA recalls + settlement stubs (stretch) | **ACT** (+ADDRESS/AWARE for terminated) | mixed (REST + scrape) | none | openFDA strong; FSIS moderate; settlements weak | ✅ openFDA verified; ⚠️ FSIS schema INFERRED |

**Tier-allowlist note (critical for §11):** The §11 open-inference judge assigns source tier **mechanically from a hardcoded eTLD+1 domain allowlist** (Tier-1 = `atsdr.cdc.gov`, `*.epa.gov`, `usgs.gov`, `cdc.gov`/`dol.gov`, `pubchem.ncbi.nlm.nih.gov`; Tier-2 = `oehha.ca.gov` + enumerated `*.state.*.us`). Among the sources below, **only EPA (`*.epa.gov`, source 2 & 3)** is Tier-1 and **only OEHHA (`oehha.ca.gov`, source 4)** is Tier-2 *on that allowlist as written today*. `saferproducts.gov`/`cpsc.gov`, `api.fda.gov`/`fda.gov`, `fsis.usda.gov`, and `oag.ca.gov` are **NOT** on the §11 allowlist, so a §11 pathway cannot be *grounded* on them as written. They remain fully valid for **§3 product-list finding confirmation** (which uses re-fetch + content match, not the §11 tier allowlist). See **Harness Implications** — the allowlist likely needs to be extended for these federal regulator domains.

---

## 1. CPSC Product Recalls API (SaferProducts.gov RESTful Web Service)

**Confidence:** `verified_official_docs` (params verified against the live API, not the PDF).
**Feeds tier:** **ACT (primary).** Each recall is an actionable stop-use / repair / refund / replace directive with a stable deep-link, strong `severity_basis` (hazard sentence), and explicit remedy → maps cleanly to `tier=ACT`, `action=Remedy/RemedyOption`.

### Access
- **Method:** REST API, plain HTTPS GET.
- **Base URL:** `https://www.saferproducts.gov/RestWebServices/Recall`
- **Auth:** **none.** VERIFIED: no key/token/registration; plain GET returns 200 with full JSON. (HTTP auto-upgrades to HTTPS.)
- **Canonical interface:** the SaferProducts REST service. The alternate hosts `data.cpsc.gov` (Socrata SODA3, **needs an app token**) and the older `catalog.data.gov` listing are the *same data* — **use the SaferProducts REST service** (no token, parameterized).

### Endpoint
Single endpoint for all search + retrieval; all filtering via query-string params (**AND-combined, substring/contains matching**). Returns a JSON array of recall objects (or XML `<Recalls>`). With no params it returns the **entire corpus (~9,853 records, ~27 MB, 1973-06-08 → 2026-06-11), newest-first by `RecallDate`.**

| Param | Meaning |
|-------|---------|
| `format=json\|xml` | **Default is XML — you MUST pass `format=json`.** |
| `RecallNumber` | Exact public recall number (e.g. `26094`) → returns exactly that one recall. **Citation locator.** |
| `RecallID` | Internal numeric id. **Use as DB primary key.** |
| `RecallTitle` | Keyword match on headline. |
| `RecallDescription` | Keyword match on product description text. |
| `ProductName` | Keyword match on structured product name. |
| `Manufacturer` / `Importer` / `Distributor` / `Retailer` | Keyword match on the structured company fields. |
| `ManufacturerCountry` | Country of origin. |
| `UPC` | Exact UPC match (only when the recall published one). |
| `Hazard` | Keyword. |
| `RecallDateStart` / `RecallDateEnd` | `YYYY-MM-DD`, filter on announce date. |
| `LastPublishDateStart` / `LastPublishDateEnd` | `YYYY-MM-DD`, filter on last-published/update date — **best for incremental "what changed" pulls.** |

### Query strategy for Warden (product/brand → recall)
Query the most specific structured field, then fall back to keyword:
1. **Brand/maker** → `&Manufacturer=Fisher-Price` — **AND also try `&Importer=` and `&Distributor=`** (cheap-import recalls put the responsible firm under Importer/Distributor; `Manufacturers[]` is often empty for AliExpress-type recalls — verified `Manufacturer=Peloton` → 0).
2. **Product noun** → `&ProductName=helmet` or `&RecallTitle=helmet`.
3. **Free description** → `&RecallDescription=lithium%20battery`.
4. **Exact code** → `&UPC=<upc>` or `&RecallNumber=<n>`.
- AND-combine with a date floor (`&RecallDateStart=2020-01-01`) for relevance.
- **Model matching is unreliable** — `Products[].Model` is frequently EMPTY; match on brand + product-noun + UPC, confirm against Description text.
- Because there is **no single global free-text param** and params are AND-combined, query multiple fields (`RecallTitle`, `RecallDescription`, `ProductName`) separately and **merge by `RecallID`**.

### Response → dossier mapping
JSON array of recall objects. Top-level (verified live):
- `RecallID` (int, stable internal id) → **DB primary key / upsert key**
- `RecallNumber` (string, e.g. `"26094"`) → **`source.locator`** (citation token)
- `RecallDate` (ISO datetime), `LastPublishDate` (ISO datetime → freshness/incremental)
- `Title` → human summary / part of locator
- `Description` → `severity_basis` / product identification
- `URL` → **`source.url`** (canonical permanent cpsc.gov recall page)
- `ConsumerContact`

Nested arrays: `Products[]{Name,Description,Model,Type,CategoryID,NumberOfUnits}`; `Hazards[]{Name,HazardType,HazardTypeID}` (`Name` is a full sentence; `HazardType`/`HazardTypeID` codes often EMPTY → derive `hazard_type` from `Name`); `Remedies[]{Name}`; `RemedyOptions[]{Option}` (e.g. Refund/Repair/Replace); `Injuries[]{Name}`; `Manufacturers[]/Importers[]/Distributors[]/Retailers[]{Name,CompanyID}`; `ManufacturerCountries[]{Country}`; `ProductUPCs[]` (often empty); `Images[]{URL,Caption}`; `Inconjunctions[]`; `SoldAtLabel` (often null).

Mapping: `tier=ACT`; `hazard_type ← Hazards[].Name`; `severity_basis ← Hazards[].Name + Injuries[]`; `action ← Remedies[].Name + RemedyOptions[].Option`; `item ← Products[].Name`; `source.url ← URL`; `source.locator ← RecallNumber` (+ `Title`); `origin = user_listed`.

### Stable citation (§3) — STRONG
Two stable handles per recall:
1. `source.url` = the object's `URL` field (canonical permanent cpsc.gov page).
2. Re-fetchable API locator: `GET /RestWebServices/Recall?format=json&RecallNumber=<n>` deterministically returns that exact recall (verified `RecallNumber=26094` → exactly 1 record).
- Recommended `source.locator = RecallNumber`. To pin a sub-fact, qualify with field+index, e.g. `Hazards[0].Name` or `RemedyOptions[0].Option`.
- Confirmable because `RecallNumber`/`RecallID` are immutable and the API echoes the same Title/Description/Hazard/Remedy.

### Example requests
```bash
# Search by description + date floor
curl -s "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDescription=lithium%20battery&RecallDateStart=2025-01-01"

# Deep-link / confirm ONE recall (locator)
curl -s "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallNumber=26094"

# Incremental "what's new since last crawl"
curl -s "https://www.saferproducts.gov/RestWebServices/Recall?format=json&LastPublishDateStart=2026-06-01"

# Verified example product->hazard lookup (returned 23 helmet recalls)
curl -s "https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=helmet&RecallDateStart=2024-01-01"
```

### Freshness
Updated continuously / multiple times per business day (verified records dated same day as crawl). Incremental: persist last-run timestamp, query `&LastPublishDateStart=<last_run>` (captures brand-new AND re-published/updated recalls), newest-first so you can stop early. `cache-control: no-cache` (always live, no stale CDN). **Avoid full-corpus pulls** (~27 MB) for routine refresh.

### Rate limits
No documented limit; no `X-RateLimit-*` / `Retry-After` headers. Treat as courtesy-limited: throttle, cache locally, prefer date-filtered incremental queries. Do not repeatedly hit the unfiltered endpoint.

### Joins
Product→recall is **keyword-based, no clean key**. Best path: brand keyword across `Manufacturer` + `Importer` + `Distributor`; product-noun keyword in `ProductName`/`RecallTitle`; disambiguate with `ProductUPCs[]` (often empty) + Description. `Products[].Model` usually blank — unreliable. No ZIP/geo join (recalls are national); `ManufacturerCountries[]` = country of origin only. UPC is the one clean structured key when both sides carry it.

### Gotchas
- Default format is **XML** — must pass `&format=json`.
- 🚩 **The Programmer's Guide PDF is image-scanned and 403s to automated fetch; the param list here was verified by hitting the live API, not parsed from the PDF.** (Builder: trust the live-verified params.)
- `Manufacturers[]` frequently EMPTY for import recalls — query Importer/Distributor too.
- `HazardType`/`HazardTypeID`, `Products[].Model`/`Type`/`CategoryID` often empty — derive identity/hazard from free text.
- `ProductUPCs[]` empty for most recalls — UPC match only works on the minority.
- Newest-first ordering is observed but **not contractually documented** — sort client-side if you depend on it.
- `RecallID` (internal) ≠ `RecallNumber` (public): DB key vs citation token.
- `data.cpsc.gov` (Socrata, needs token) vs `saferproducts.gov` REST (no token) — use the latter.

> **§11 note:** `cpsc.gov`/`saferproducts.gov` is **NOT** on the §11 domain allowlist as written, so this source cannot *ground a §11 pathway*. It is the canonical **§3 confirmation** source for user-listed product recalls regardless. (See Harness Implications re: extending the allowlist.)

---

## 2. EPA ECHO Safe Drinking Water Act (SDWA) REST Services + SDWIS bulk download

**Confidence:** `verified_official_docs`.
**Feeds tier:** **ADDRESS (primary, location-based drinking-water violations).** The system-level violation/SNC/contaminant snapshot also feeds **AWARE**; the bulk `SDWA_VIOLATIONS_ENFORCEMENT.csv` feeds **per-violation CONTEXT/discovery**.

### Access
- **Method:** mixed (REST + bulk CSV ZIP).
- **Base URL:** `https://echodata.epa.gov/echo/` (SDW + DFR REST). Bulk files: `https://echo.epa.gov/files/echodownloads/`.
- 🚩 **Host change:** the older host `ofmpub.epa.gov` (documented in datafire/streamdata third-party wrappers) is now **DEAD (404)** — **use `echodata.epa.gov`.**
- **Auth:** **none.** Fully open GET endpoints (verified HTTP 200, no headers). Bulk ZIP is a static public file.

### Endpoints
| Name | URL | Notes |
|------|-----|-------|
| `sdw_rest_services.get_systems` | `https://echodata.epa.gov/echo/sdw_rest_services.get_systems` | **Primary search.** Returns matching PWS + summary counts (`QueryRows`, `V3Rows`=violations, `FEARows`=formal enforcement, `INSPRows`=site visits) and a `QueryID` (QID). With `passthrough=Y` returns the full `WaterSystems[]` inline. Params: `p_st` (2-letter state), `p_co` (county, URL-encoded), `p_pid` (**PWSID — the param is `p_pid` NOT `p_pwsid`**), `p_zip` (**UNRELIABLE — usually 0 rows**), `output=JSON\|XML\|JSONP`, `passthrough=Y`, `responseset` (rows/page), `qcolumns` (comma list of metadata ColumnIDs), `callback`. |
| `sdw_rest_services.get_qid` | `.../sdw_rest_services.get_qid` | Paginate a prior result set without re-running. `qid`, `pageno`, `responseset`, `qcolumns`, `output=JSON`. **QIDs expire ~30 min.** |
| `sdw_rest_services.get_download` | `.../sdw_rest_services.get_download` | CSV of systems for a QID. **MUST be CSV output** (`output=JSON` errors `'Output Type must be CSV'`). `qid` (required), `qcolumns` (e.g. `1,2,4,5,6,14,19`). |
| `sdw_rest_services.metadata` | `.../sdw_rest_services.metadata` | `ColumnID → ColumnName/ObjectName` dictionary for building `qcolumns`. e.g. `2=PWSID`, `5=ZIP_CODES_SERVED`, `14=POPULATION_SERVED_COUNT`, `19=QTRS_WITH_VIO`. `output=JSON`. |
| `dfr_rest_services.get_dfr` | `.../dfr_rest_services.get_dfr` | Detailed Facility Report for one PWSID → FRS RegistryID + facility address. `p_id` (PWSID), `output=JSON`. **Resolves PWSID → FRS RegistryID for the canonical DFR deep link.** |
| SDWA bulk download (SDWIS) | `https://echo.epa.gov/files/echodownloads/SDWA_latest_downloads.zip` | Quarterly ZIP of CSVs (verified live HTTP 206, `application/zip`). Contains `SDWA_PUB_WATER_SYSTEMS.csv`, **`SDWA_VIOLATIONS_ENFORCEMENT.csv`** (the ONLY source of individual `VIOLATION_ID`s), `SDWA_GEOGRAPHIC_AREAS.csv`, `SDWA_LCR_SAMPLES.csv` (lead/copper), reference-code tables. Join on `PWSID` + `SUBMISSIONYEARQUARTER`. |

### Query strategy for Warden (ZIP → water system)
🚩 **CRITICAL — do NOT query `p_zip` directly** (verified `p_zip=90210` and `p_zip=95814` → 0 rows; `p_zip5` is not a valid param; `ZipCodesServed` is null for most small systems). Robust path:
1. Map **ZIP → county + state** via an external crosswalk (US Census ZCTA-to-county relationship file or HUD USPS ZIP-county crosswalk, or a static ZIP→FIPS table).
2. `get_systems?output=JSON&p_st=<ST>&p_co=<County>&passthrough=Y&responseset=N` → all PWS serving that county, each with `PWSId`, `PopulationServedCount`, `QtrsWithVio`, `SeriousViolator`, `HealthFlag`, `SDWAContaminantsInViol3yr`.
3. **Disambiguate the user's likely provider:** filter `PWSTypeCode=CWS` + largest `PopulationServedCount` + `CitiesServed` match (a residential ZIP is usually served by 1–2 community water systems; many results are tiny transient systems — schools, RV parks, churches — irrelevant to a resident).
4. For per-violation detail (`VIOLATION_ID`, contaminant, dates, health-based flag), join that PWSID into `SDWA_VIOLATIONS_ENFORCEMENT.csv` from the bulk ZIP.
- Fast single-system check: `get_systems?p_pid=<PWSID>&passthrough=Y`.

### Response → dossier mapping
`get_systems` (`passthrough=Y`) `WaterSystems[]`:
- `PWSId` + `PWSName` → `item` / `source.locator`
- `SDWAContaminantsInViol3yr` (e.g. `"1040=Nitrate"`) → `hazard_type`
- `HealthFlag` / `SeriousViolator` / `IS_HEALTH_BASED_IND` → `severity_basis` + tier (HealthFlag=Yes ⇒ ADDRESS/ACT-leaning)
- `QtrsWithVio`, `V3Rows`, `RulesVio3yr` → `condition` / `confidence`
- `SDWDateLastFea` (last formal enforcement date) → recency
- `DfrUrl` → `source.url`
- `is_ubiquitous=false` (location-specific). `origin=ai_inferred` (system inferred from ZIP, not user-listed).

Per-finding from bulk `SDWA_VIOLATIONS_ENFORCEMENT.csv`: `VIOLATION_ID` → `source.locator`; `VIOLATION_CODE` + `CONTAMINANT_CODE` → `hazard_type` (**decode via reference tables in the ZIP — they are coded integers**); `NON_COMPL_PER_BEGIN_DATE/END_DATE` → `condition`; `IS_HEALTH_BASED_IND` → `severity_basis`.

### Stable citation (§3) — STRONG (two strategies)
1. **Per-system DFR deep link** returned directly as `WaterSystems[].DfrUrl`: `https://echo.epa.gov/detailed-facility-report?fid=<FRS_RegistryID>` (verified HTTP 200; `fid` = FRS RegistryID, also in `get_systems.RegistryID` / `get_dfr`). **Recommended `source.url`; `source.locator = PWSID`.**
2. **Per-violation:** `source.url` = SDWA bulk download URL (or DFR); `source.locator` = `VIOLATION_ID` + `SUBMISSIONYEARQUARTER` + `PWSID` (uniquely pins one row, re-fetchable each quarter).
- 🚩 **Caveat:** the DFR human page is **JS-rendered**, so the locator (PWSID/VIOLATION_ID) carries the fact, not a URL anchor; the backing `sdw_rest_services`/`dfr_rest_services` JSON is the machine-confirmable layer.

### Example requests
```bash
# All systems in a county (verified)
curl 'https://echodata.epa.gov/echo/sdw_rest_services.get_systems?output=JSON&p_st=CA&p_co=Los%20Angeles&passthrough=Y&responseset=50'

# Single-system check (verified: City of Adelanto, 1040=Nitrate, last formal enforcement 02/10/2025,
# DfrUrl fid=110013161229)
curl 'https://echodata.epa.gov/echo/sdw_rest_services.get_systems?output=JSON&p_pid=CA3610001&passthrough=Y'
```

### Freshness
🚩 **NOT real-time.** States report quarterly to SDWIS/Fed; expect ~1–2 quarter lag. Current API data version observed: **`SDWA v2020-02-05 1500`** (in every response's `Results.Version` — surface the as-of quarter to the user). Bulk ZIP refreshed quarterly. Incremental: snapshot `QtrsWithVio`/`SDWDateLastFea` per PWSID and diff each quarter, or diff `VIOLATION_ID`s in the bulk CSV across quarterly pulls (rows keyed by `SUBMISSIONYEARQUARTER`).

### Rate limits
No documented hard limit. Two practical constraints: (a) `get_systems` enforces a result-set cap — over-broad queries error `'Rows Returned would be 433698. Queryset Limit would be exceeded...'`, so **always pass `p_st` + `p_co` (or `p_pid`)`**; (b) **QIDs expire ~30 min** — paginate/download promptly. Responses can be multi-second for large counties; use low concurrency.

### Joins
🚩 **No reliable direct ZIP→water-system API** (the single biggest ADDRESS-tier integration gotcha — Issue #007). Path: ZIP → county+FIPS via external crosswalk → `get_systems` by `p_st`+`p_co` → disambiguate by `PWSTypeCode=CWS` + largest `PopulationServedCount` + `CitiesServed`. The bulk `SDWA_PUB_WATER_SYSTEMS.csv` carries a `ZIP_CODE` column (system's billing/legal-entity ZIP, **not** service area) — secondary signal only. **PWSID format** = 2-letter state/region code + 7 digits (e.g. `CA3610001`). **FRS RegistryID** (numeric, e.g. `110013161229`) is the cross-system key for the DFR deep link.

### Gotchas
- 🚩 Use host `echodata.epa.gov`, **not `ofmpub.epa.gov`** (404).
- 🚩 `p_zip` is effectively useless (0 rows for valid residential ZIPs) — go through county+state.
- `get_download` requires CSV output; for inline JSON use `get_systems` with `passthrough=Y`.
- The PWSID param is **`p_pid`**, not `p_pwsid` — **wrong param names are silently ignored** (treated as no filter), tripping the 433,698-row cap error (a silent failure mode).
- Over-broad queries hit the result-set cap — always include `p_st` + `p_co` or `p_pid`.
- REST returns COUNTS + a 3-yr contaminant summary, **not individual violation records** — for per-`VIOLATION_ID` detail you MUST parse the bulk ZIP.
- Data lags reality ~1–2 quarters; surface the as-of quarter.
- `CONTAMINANT_CODE`/`VIOLATION_CODE` are coded integers — join the reference/lookup tables in the ZIP for human names.
- One ZIP → multiple PWS; many are tiny transient/non-community — filter to `PWSTypeCode=CWS` + meaningful population.

> **§11 note:** `*.epa.gov` IS Tier-1 on the §11 allowlist — this source is fully usable to **ground §11 pathways** (e.g. water-system violation context). The ECHO/SDWIS record is the canonical Tier-1 attestation for SDWA-route findings.

---

## 3. EPA PFAS / UCMR 5 Occurrence Data + ECHO/FRS Facility Data

**Confidence:** `verified_official_docs` (ECHO live-verified; **FRS live-response UNVERIFIED** — see below).
**Feeds tier:** **CONTEXT (§11 contextual discovery: location → nearby airport/military/industrial facility → AFFF/PFAS source → water-system PFAS detection).** UCMR PFAS detections can also feed **ADDRESS/AWARE** for a specific PWSID; ECHO/FRS facility proximity feeds discovery/context. This is the flagship §11 source (the AFFF→PFAS golden case).

### Access
- **Method:** mixed (bulk text files + REST).
- **Base URLs:** UCMR 5 bulk: `https://www.epa.gov/system/files/other-files/2023-08/` ; ECHO All Data REST: `https://echodata.epa.gov/echo/` ; FRS REST: `https://frs-public.epa.gov/ords/frs_public2/` (legacy `https://ofmpub.epa.gov/frs_public2/` now **302-redirects** here — use `-L`).
- **Auth:** **none** for all. No documented rate limits, but ECHO QIDs expire ~30 min; EPA asks heavy users to use the downloadable text files rather than hammering REST.

### Endpoints
| Name | URL | Notes |
|------|-----|-------|
| UCMR 5 Occurrence Data (bulk, all states) | `https://www.epa.gov/system/files/other-files/2023-08/ucmr5-occurrence-data.zip` | ZIP of tab-delimited files: **`UCMR5_All.txt`** (every PFAS/lithium result by PWS), **`UCMR5_AddtlDataElem.txt`** (PFAS Occurrence/Treatment/**Potential PFAS Sources** + detail), **`UCMR5_ZIPCodes.txt`** (ZIP→PWSID). Primary source-of-truth for PFAS detections. Variants: `...-by-state.zip` (A–L / M–W split), `...-by-method-classification.zip`. |
| UCMR 5 Data Finder (interactive) | `https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule-data-finder` | Human Qlik tool; export to `.xlsx` (≤1,000,000 rows). **No documented JSON API** — cite the bulk file or this page. |
| ECHO `get_facilities` (validate + QID) | `https://echodata.epa.gov/echo/echo_rest_services.get_facilities` | LIVE-VERIFIED (HTTP 200, `'ALL DATA v2017-06-16'`). Spatial: `p_lat,p_long,p_radius` (miles) OR bbox `xmin,ymin,xmax,ymax`; `p_st,p_co,p_city,p_zip`; `p_fn` (facility name); `p_frs` (FRS id); flags `p_act=Y`,`p_maj=Y`; `responseset`. Returns counts + `QueryID`. |
| ECHO `get_qid` (rows) | `https://echodata.epa.gov/echo/echo_rest_services.get_qid` | LIVE-VERIFIED. Returns `Facilities[]` with `FacName, FacStreet, FacCity, FacState, FacZip, RegistryID (FRS id), FacSICCodes, FacNAICSCodes`. `qid`, `output=JSON`, `responseset`, `PageNo`, `qcolumns` (e.g. `1,2,3,4,5,14,15,16`). |
| ECHO `get_facility_info` (self-contained) | `https://echodata.epa.gov/echo/echo_rest_services.get_facility_info` | LIVE-VERIFIED. Same params; QID + clustered map/summary in one call. |
| ECHO `get_download` (CSV) | `https://echodata.epa.gov/echo/echo_rest_services.get_download` | CSV of facilities for a QID. `qid`, `qcolumns`. |
| ECHO PFAS Analytic Tools (UI) | `https://echo.epa.gov/trends/pfas-tools` | Interactive only; PFAS layers (airports, DoD, manufacturers, TRI) **not auto source→detection linked**. No API. Corroboration only. |
| FRS `get_facilities` (spatial) | `https://frs-public.epa.gov/ords/frs_public2/frs_rest_services.get_facilities` | 🚩 **Endpoint/params from official docs; live response UNVERIFIED (sandbox call TLS-connected but timed out — slow ORDS / possible IP throttle).** `latitude83,longitude83,search_radius` (**all 3 required together, radius max 25 mi**); `state_abbr`, `zip_code`, `county_name`, `city_name`, `facility_name`, `registry_id`, `pgm_sys_acrnm` (e.g. SDWIS, NPDES, AIRS/AFS, RCRAINFO, TRIS, SEMS), `pgm_sys_id`, `output=JSON\|XML\|JSONP`, `program_output=Y`, `coordinates_output=Y`. |

### Query strategy for Warden (ZIP/lat-long or site → PFAS context)
1. **PFAS-by-location:** load `UCMR5_ZIPCodes.txt` to map ZIP → PWSID(s); filter `UCMR5_All.txt` for those PWSIDs where `Contaminant` is a PFAS analyte (PFOA, PFOS, PFHxS, PFNA, HFPO-DA/GenX) **AND `AnalyticalResultsSign='='`** (a real detection ≥ MRL; `'<'` or null = non-detect). Compare `AnalyticalResultValue` to the **April 2024 PFAS NPDWR MCLs** (PFOA/PFOS 4 ng/L; PFHxS/PFNA/GenX 10 ng/L; + Hazard Index for mixtures) to set tier/severity.
2. **Source attribution:** read `UCMR5_AddtlDataElem.txt` "Potential PFAS Sources"/"...Detail" for that PWSID, AND/OR call ECHO `get_facilities` (`p_lat`/`p_long`/`p_radius` or `p_zip`) → `get_qid` to list nearby facilities; screen `FacName`/`SICCodes`/`NAICSCodes` for airports, fire-training, DoD/military, chrome plating, fluoropolymer mfg to support the AFFF→PFAS hypothesis. FRS `get_facilities` with `pgm_sys_acrnm` narrows to specific programs.
- **ECHO is the verified live path; FRS is the cross-program complement.**

### Response → dossier mapping
`UCMR5_All.txt` (tab-delimited): `PWSID, PWSName, Size, FacilityID, FacilityName, SamplePointID, Contaminant` (→ `hazard_type`, e.g. "PFOA in drinking water"), `AnalyticalResultsSign` (`=` detect / `<` non-detect), `AnalyticalResultValue` (→ `severity_basis`, ng/L), `MRL, MethodID, CollectionDate, State`. `UCMR5_ZIPCodes.txt`: `PWSID + ZIPCode` (geo join). `UCMR5_AddtlDataElem.txt`: `PWSID, FacilityID, SamplePointID, PFAS Occurrence, PFAS Treatment, Potential PFAS Sources, Potential PFAS Sources Detail` (→ `condition`/context). ECHO `get_qid` JSON: `Facilities[]{FacName,FacStreet,FacCity,FacState,FacZip,RegistryID,FacSICCodes,FacNAICSCodes}` + envelope `QueryRows/QueryID/PageNo`. FRS JSON: `RegistryId, FacilityName, address, latitude83/longitude83`, program membership (with `program_output=Y`).
- `source.url` = EPA bulk-file/page or ECHO facility report URL; `source.locator` = **`{PWSID, Contaminant, SamplePointID, CollectionDate}`** (UCMR) or **FRS RegistryID** (facility).
- For §11: `inferred_agent` for the flagship case normalizes as the **PFAS class id**, not a single CASRN (the rubric explicitly requires class/mixture normalization — a single-CASRN-only gate would wrongly drop the flagship AFFF→PFAS case).

### Stable citation (§3)
- **UCMR PFAS detection:** the re-fetchable fact lives in the versioned bulk text file. `source.url` = EPA Occurrence Data page (`https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule`) or the direct ZIP URL; `source.locator` = composite key `{PWSID, Contaminant, SamplePointID, CollectionDate, AnalyticalResultValue}` (uniquely pins one row; re-confirmable by re-downloading + filtering, or reproducing the filter in the Data Finder). 🚩 **Capture dataset version/download date — data is reissued quarterly through 2026.**
- **Facility:** stable deep link via FRS RegistryID → ECHO Detailed Facility Report `https://echo.epa.gov/detailed-facility-report?fid=<RegistryID>`; `source.locator` = 12-digit FRS RegistryID.

### Example requests
```bash
# ECHO (LIVE-VERIFIED) — facilities within 2 miles of a point, then fetch rows
curl "https://echodata.epa.gov/echo/echo_rest_services.get_facilities?output=JSON&p_lat=38.8&p_long=-77.01&p_radius=2&responseset=5"   # -> "QueryID":"884"
curl "https://echodata.epa.gov/echo/echo_rest_services.get_qid?output=JSON&qid=884&responseset=5&qcolumns=1,2,3,4,5,14,15,16"

# FRS (params from docs; LIVE RESPONSE UNVERIFIED — backend timed out)
curl -L "https://frs-public.epa.gov/ords/frs_public2/frs_rest_services.get_facilities?latitude83=38.8&longitude83=-77.01&search_radius=3&pgm_sys_acrnm=SEMS&output=JSON&program_output=Y&coordinates_output=Y"

# UCMR PFAS bulk
curl -O "https://www.epa.gov/system/files/other-files/2023-08/ucmr5-occurrence-data.zip"
# then filter UCMR5_All.txt where Contaminant like 'PF%' AND AnalyticalResultsSign='='
```

### Freshness
UCMR 5 reposted **quarterly through completion of reporting in 2026** (labs report within 90 days of collection +30 days PWS review). No "since" param on bulk files; re-download + capture version. ECHO/FRS facility data refreshes on rolling EPA loads (PFAS Analytic Tools layers mostly weekly; UCMR layer quarterly). For ECHO, scope recency via `CollectionDate`/date filters.

### Rate limits
No published limit. ECHO QID valid ~30 min. 🚩 **FRS ORDS backend can be slow/unresponsive** (sandbox call timed out at 90s) — modest concurrency, retries, and prefer the bulk UCMR text files for large PFAS scans. Paginate ECHO via `responseset`/`PageNo`.

### Joins
1. ZIP → PWSID via `UCMR5_ZIPCodes.txt` (one ZIP → several PWSIDs; not every PWS has ZIPs populated).
2. **PWSID is the universal key** linking `UCMR5_All.txt`, `UCMR5_AddtlDataElem.txt`, `UCMR5_ZIPCodes.txt`.
3. Facility proximity via lat/long+radius (ECHO `p_lat/p_long/p_radius` or FRS `latitude83/longitude83/search_radius ≤25mi`); classify by NAICS/SIC.
4. **`ECHO RegistryID == FRS RegistryId`** → deep-link to FRS and the ECHO DFR.
5. PWSID can join to SDWIS (`pgm_sys_acrnm=SDWIS` in FRS) to geolocate the water system — and to **Source 2** (same PWSID key).

### Gotchas
- 🚩 UCMR reports **ONLY** results ≥ MRL. A blank/null `AnalyticalResultValue` OR `AnalyticalResultsSign='<'` = non-detect, **NOT** missing data — do not treat null as zero-risk vs a true measurement.
- 🚩 **Absence ≠ clean water:** systems serving <3,300 people generally NOT sampled (only a ~800-PWS representative subset of small systems); TNCWS excluded; state out-of-compliance/missed-sample cases leave gaps. (Consistent with Warden's "absence is neutral, never reassuring" stance.)
- UCMR 5 still being populated through 2026 — a PWS may not have monitored/reported yet; re-check quarterly; capture dataset version.
- 🚩 PWSID/names/FacilityID/SamplePointID **can change between UCMR cycles** — pin `UCMR5` (the cycle) in the locator.
- Compare values to the April 2024 NPDWR MCLs for tier/severity; UCMR itself is monitoring-only (sets MRLs, not limits).
- `UCMR5_All.txt` > 1,048,576 rows — too big for Excel; use the by-state/by-method splits or load in pandas/DB. **Keep ID columns as text** (preserve leading zeros).
- ECHO QID expires ~30 min.
- 🚩 FRS legacy host `ofmpub.epa.gov/frs_public2` 302-redirects to `frs-public.epa.gov/ords/frs_public2` — use `-L`. FRS requires all 3 of `latitude83`+`longitude83`+`search_radius`, radius ≤ 25 mi.
- 🚩 **ECHO/FRS facility proximity is a HYPOTHESIS of a PFAS source, NOT proof of contamination.** A nearby airport/base supports the AFFF→PFAS narrative but the confirmable hazard fact is the **UCMR detection at the PWSID**. Keep `is_ubiquitous`/`confidence` honest; label facility-proximity findings `origin=ai_inferred`. (This is exactly the §11 "grounding earns the right to investigate, never to alarm" rule.)
- ECHO All Data warehouse version observed `2017-06-16` in the response header (service stack age; underlying program data is current).

> **§11 note:** `*.epa.gov` IS Tier-1 — UCMR/ECHO/FRS can ground §11 pathways. The route attestation for AFFF→PFAS must be a **regulatory route statement** (ATSDR fate-and-transport / EPA fact sheet), and the **confirmable finding** is the UCMR detection at the PWSID, not the facility proximity.

---

## 4. California Proposition 65 — OEHHA chemical list + CA Attorney General 60-Day Notice database

**Confidence:** `verified_official_docs`.
**Feeds tier:** Primary feed for **CONTEXT (ubiquitous-warning calibration / `is_ubiquitous`).** Two roles:
- (1) **OEHHA Prop 65 chemical list** = master list of ~1,000 listed chemicals → decides `is_ubiquitous`, supplies `severity_basis`/`hazard_type` (cancer vs developmental/reproductive).
- (2) **AG 60-Day Notice database** = **ADDRESS/AWARE** enforcement signal — real notices tying a chemical to a specific product/company, deep-linkable per notice.
- Combined: Prop 65 is the **calibration backbone** so Warden does not over-alarm on warnings that are on nearly everything sold in CA (the §5 cardinal sin).

### Access
- **Method:** mixed (file download + HTML/CSV query).
- **Base URLs:** OEHHA list: `https://oehha.ca.gov/proposition-65/proposition-65-list` ; AG 60-day notices: `https://oag.ca.gov/prop65`.
- **Auth:** **none for reading.** 🚩 **CAVEAT (verified): `oehha.ca.gov` sits behind Imperva/Incapsula bot protection** — a cold scripted curl can succeed, but repeated/headless hits get a **JS-challenge HTML page (200 OK, `text/html`, ~212 bytes, contains `_Incapsula_Resource`)** instead of the file. A scraper must use a real browser session / honor the Incapsula cookie / use a browser driver (Playwright). **`oag.ca.gov` has NO such block** — plain curl with a normal UA works. (Filing notices needs an account, but Warden only reads.)

### Endpoints
| Name | URL | Notes |
|------|-----|-------|
| OEHHA Prop 65 list (landing page) | `https://oehha.ca.gov/proposition-65/proposition-65-list` | Current version **dated December 5, 2025**; download links for PDF/Excel/CSV. **Re-scrape the format links here each run** rather than hardcoding dated paths. |
| OEHHA list — Excel | `https://oehha.ca.gov/sites/default/files/media/downloads/proposition-65/p65chemicalslist.xlsx` | Full machine-readable: Chemical name, Type of Toxicity (cancer / developmental / reproductive male/female), Date Listed, Listing Mechanism/Basis (Labor Code, AB, FR, SQE), safe-harbor level where adopted. ~100 KB cold; **Incapsula-gated on repeat scripted hits.** Filename stable; **content mutates in place across updates.** |
| OEHHA list — CSV | `https://oehha.ca.gov/sites/default/files/media/2025-01/p65chemicalslist.csv` | ~70 KB. 🚩 **Dated path segment `media/2025-01/` is NOT stable across releases — prefer the `.xlsx` canonical path or re-scrape the landing page.** |
| OEHHA list — PDF | `https://oehha.ca.gov/sites/default/files/media/downloads/proposition-65/p65chemicalslist.pdf` | ~544 KB. Stable citation target; not machine-parseable for joins. |
| OEHHA safe-harbor levels (NSRL/MADL) | `https://oehha.ca.gov/proposition-65/general-info/current-proposition-65-no-significant-risk-levels-nsrls-maximum` | Page + Excel of NSRL (cancer) / MADL (reproductive). 🚩 **VERIFIED: no CAS numbers in this export; covers many but not all listed chemicals.** Low safe-harbor level → stronger `severity_basis`. |
| AG 60-Day Notice search form | `https://oag.ca.gov/prop65/60-day-notice-search` | Filters: AG Number, Report Year, Plaintiff/Noticing Party, Plaintiff Attorney, Defendant, date range, Source/Product (free text), Chemical (dropdown). DB covers 1988–present. Params: `field_prop65_id_value`, `field_prop65_report_year_value`, `field_prop65_plaintiff_value`, `field_prop65_defendant_value`, `field_prop65_product_value`, `field_prop65_chemical_tid[]` (taxonomy term id), `date_filter[min][date]`/`[max][date]`, `sort_by`, `items_per_page`, `page`. |
| AG 60-Day Notice search RESULTS (HTML) | `https://oag.ca.gov/prop65/60-day-notice-search-results` | VERIFIED plain-curl (200, `text/html`). Columns: AG Number, Notice PDF link, Date Filed, Noticing Party, Plaintiff Attorney, Alleged Violators, Chemical, Source, counts of Complaint/Settlement/Judgment. |
| AG 60-Day Notice **CSV export** | `https://oag.ca.gov/prop65/60-day-notice-results-export_details.csv` | VERIFIED working (returns `content-disposition: attachment 60-day-notice-results_save.csv`, `text/csv`). Up to **1,000** records. Same query params + `attach=page_1/1000`. Columns: AG Number, Date, Noticing Party, Plaintiff Attorney, Alleged Violator(s), Chemicals, Source, Comments, Case ID, Case Name, Court Docket Number, Civil Penalty, Attorney Fees, Other Payments, Type of Claim, Relief Sought, Injunctive Relief. |
| AG individual notice page (deep-link / locator) | `https://oag.ca.gov/prop65/60-Day-Notice-{AG-NUMBER}` (e.g. `.../60-Day-Notice-2026-02721`) | **Canonical `source.url` + locator.** Keyed by AG Number (format `YYYY-NNNNN`). |
| AG notice PDF (the fact document) | `https://oag.ca.gov/system/files/prop65/notices/{AG-NUMBER}.pdf` | VERIFIED pattern. The scanned/filed notice — re-fetchable primary fact. 🚩 **Some older notices use `.PDF` — try both cases.** |

### Query strategy for Warden (two paths)
**(A) `is_ubiquitous` + chemical metadata:** load the OEHHA `.xlsx` once per crawl into a lookup keyed by **chemical NAME** (no CAS key — see below). Given a product's declared/known chemical (lead, BPA, DEHP…), check membership and pull Type of Toxicity (→ `hazard_type` cancer vs reproductive/developmental), Listing Mechanism + safe-harbor level (→ `severity_basis`). **A plain "Prop 65 WARNING" or listing-only hit → `is_ubiquitous=true` / CONTEXT tier, NOT an ACT/ADDRESS alarm**, unless paired with an actual enforcement notice.

**(B) Product/company-specific enforcement:** hit the AG CSV export with `field_prop65_product_value={product}` and/or `field_prop65_defendant_value={brand/company}`. Each returned row = a specific chemical + product + alleged violator + date → an **ADDRESS/AWARE** finding with the per-notice page as `source.url`, AG Number as `source.locator`. To narrow by chemical, use `field_prop65_chemical_tid[]` (taxonomy id — harvest the id→chemical map once from the search form's dropdown).

### Response → dossier mapping
- **OEHHA row:** Chemical name → match key; Type of Toxicity → `hazard_type` (cancer | developmental | reproductive); Listing Mechanism + NSRL/MADL → `severity_basis`; membership → `is_ubiquitous=true` default for warning-only hits.
- **AG notice row:** Source → `item`/product; Chemicals → `hazard_type`/chemical; Alleged Violator(s) → company entity (join); AG Number → `source.locator`; per-notice page URL → `source.url`; Date → recency. Settlement fields (Civil Penalty / Attorney Fees / Case Name / Court Docket) indicate resolution. `origin=ai_inferred` (Warden discovered it).
- 🚩 **A notice is the evidence that downgrades `is_ubiquitous` to an actionable (ADDRESS/AWARE) finding** — a bare listing alone does not.

### Stable citation (§3)
- **AG enforcement (STRONGEST stable deep-link):** `source.url = https://oag.ca.gov/prop65/60-Day-Notice-{AG-NUMBER}`; `source.locator =` the AG Number (`YYYY-NNNNN`, permanent); fact document = `https://oag.ca.gov/system/files/prop65/notices/{AG-NUMBER}.pdf`. The fact (chemical X alleged in product Y vs company Z on date D) is confirmable there.
- **OEHHA chemical list:** `source.url = https://oehha.ca.gov/proposition-65/proposition-65-list`; `source.locator =` chemical name + **list-revision date** (e.g. "Prop 65 list rev. 2025-12-05"). 🚩 The `.xlsx` content **mutates in place** across releases — capture the revision date in the locator for re-confirmability. **AVOID** citing the dated CSV path (`media/2025-01/…`) as a permanent locator.

### Example requests
```bash
# AG 60-day notices for a product, as CSV (VERIFIED working)
curl -s 'https://oag.ca.gov/prop65/60-day-notice-results-export_details.csv?field_prop65_product_value=cilantro&sort_by=field_prop65_id_value&items_per_page=100&attach=page_1/1000'
# -> rows like AG 2022-01139, 06/02/2022, chemical=Lead, Source='Cilantro Lime Shrimp Rice Bowl',
#    violators incl. Walmart/Target/Kroger; cite as https://oag.ca.gov/prop65/60-Day-Notice-2022-01139

# OEHHA list (use a real browser session — Incapsula-gated for raw scripted curl)
# https://oehha.ca.gov/sites/default/files/media/downloads/proposition-65/p65chemicalslist.xlsx
```

### Freshness
OEHHA list updates only on add/remove (irregular — weeks to months; current verified rev **2025-12-05**). Track the printed "list dated" revision on the landing page; new chemicals also appear on OEHHA's Notices page. AG notices update continuously (hundreds/month — ~344 in April 2025). Incremental: AG export with `date_filter[min][date]={last_run}`, or `sort_by=field_prop65_id_value` and high-water-mark the highest AG Number per year.

### Rate limits
No published limits. `oag.ca.gov` tolerated normal scripted requests. 🚩 `oehha.ca.gov` Imperva/Incapsula throttles aggressive scripted access — pull the OEHHA list **at most once per crawl/day**, cache locally; query the AG DB on demand per product/company with reasonable pacing.

### Joins
1. **Product/company → notices:** free-text `field_prop65_product_value` matches the notice "Source" string; `field_prop65_defendant_value` matches "Alleged Violator(s)". 🚩 Both are **messy free text** (brands, retailer chains, product descriptions) — fuzzy/substring + brand-alias handling needed. One notice often lists many co-defendants (manufacturer + Walmart/Target/Amazon…), so a product hit surfaces a chain of companies.
2. 🚩 **Chemical name → OEHHA list / safe-harbor: keyed on NAME, NOT CAS** (safe-harbor export has no CAS column). Normalize names (synonyms, salts, "and its compounds" families). The AG chemical dropdown uses internal taxonomy term ids (`field_prop65_chemical_tid`, e.g. ~903/910 for lead-family) — harvest the id→name map once from the search form.

### Gotchas
- 🚩 OEHHA behind Imperva/Incapsula — detect the JS-challenge (content-type `text/html` where you expected xlsx/csv/pdf, ~212 bytes, `_Incapsula_Resource`) and fall back to a browser session/cookie. `oag.ca.gov` is NOT blocked.
- 🚩 OEHHA CSV path has a dated folder segment (`media/2025-01/…`) not stable across releases — re-scrape the landing page's format links each run; the `.xlsx` canonical path is more stable but content changes in place.
- 🚩 **Prop 65 listing is intentionally over-inclusive (~1,000 chemicals on a vast range of products) — treating any listing/warning as high-severity will massively over-fire.** Default warning-only/listing-only hits to `is_ubiquitous=true`/CONTEXT; escalate to ACT/ADDRESS ONLY with a matching enforcement notice or specific exceedance. (This is the §5 calibration backbone.)
- Chemical list + safe-harbor key on NAME not CAS — name normalization required for any join.
- "Source" and "Alleged Violator(s)" are noisy free text; one notice can name many co-defendants.
- 🚩 **A 60-day notice is an ALLEGATION (notice of intent to sue), NOT a proven violation or recall.** `severity_basis`/`action` wording must say **"alleged Prop 65 violation notice"**; settlement columns indicate resolution. (Compliance-critical for §7.)
- AG Number case varies in the PDF path (`.pdf` vs `.PDF` on older notices) — try both.
- CSV export caps at 1,000 records; broad queries (e.g. by lead) exceed this — narrow by date range or paginate the HTML.

> **§11 note:** `oehha.ca.gov` IS Tier-2 on the §11 allowlist (it can ground §11 pathways for OEHHA-listed-chemical routes). `oag.ca.gov` (the AG notices) is **NOT** on the allowlist — AG notices are an enforcement/discovery signal for product-list matching, not a §11 pathway-grounding source as the allowlist is written. (See Harness Implications.)

---

## 5. Independent-source confidence layer — Exa (neural search) + OpenAlex + Semantic Scholar

**Confidence:** `verified_official_docs` (OpenAlex live-verified; S2 throttled 429 in testing; Exa free tier verified to exist).
**Feeds tier:** **§7 confidence / evidence-grading ONLY.** These do **NOT** produce ACT/ADDRESS/AWARE/CONTEXT findings on their own and can **never upgrade a finding to ACT** — they supply independent corroboration + evidence tier (regulatory-confirmed > meta-analysis > single peer-reviewed > preprint > NGO > journalism > anecdote) and the categorical `confidence` + `caveat` + `what_would_change_this` gate 7 requires. OpenAlex/S2 grade peer-reviewed strength (publication type + citation count); Exa is the wider neural net reaching NGO/journalism/preprint tiers + primary URLs. **The golden set MUST contain ≥1 independent-source finding so this layer is exercised (§7 / Issue #006).**

### Access & Auth — 🚩 ALL THREE REQUIRE KEYS (the main provisioning blocker)
- **Base URLs:** Exa `https://api.exa.ai` ; OpenAlex `https://api.openalex.org` ; Semantic Scholar `https://api.semanticscholar.org/graph/v1`.
- **EXA — paid/key required (free tier exists).** Key from `https://dashboard.exa.ai/api-keys`; header `x-api-key: <key>` (or `Authorization: Bearer`). Free tier = up to **20,000 requests/month**; paid usage-based: Search $7/1k req (10 results), +$1/1k per result >10, Contents $1/1k pages, Deep Search $12/1k, Deep-Reasoning $15/1k. **This is Warden Issue #002.**
- 🚩 **OPENALEX — as of Feb 13 2026 an API key is now REQUIRED for real use** (free at `openalex.org/settings/api`). Without a key: ~$0.01/day free credit (≈10 search calls @ $0.001) then **409 errors** — fine for a single demo, NOT a build crawl. With a free key: $1/day free (≈1,000 searches/day). **The old `mailto` polite-pool is DEPRECATED/removed.** Key passed as `?api_key=YOUR_KEY`.
- 🚩 **SEMANTIC SCHOLAR — key optional but effectively required.** The unauthenticated shared pool is aggressively throttled (**live test returned HTTP 429 on the FIRST call** from this network). Key header `x-api-key`; request via `https://www.semanticscholar.org/product/api#api-key-form`. **GOTCHA: as of Aug 2024 S2 no longer approves key requests from free email domains (e.g. gmail.com — the project's listed email `fztmon@gmail.com`) or for 3rd-party apps;** even keyed accounts start at only 1 request/second.

### Endpoints
| Name | Method | URL | Notes |
|------|--------|-----|-------|
| Exa search (+contents) | POST | `https://api.exa.ai/search` | `query` (req), `type` (auto\|fast\|instant\|deep\|deep-reasoning), `numResults` (1–100), `category` (research paper\|news\|company\|…), `includeDomains`/`excludeDomains`, `contents:{text,highlights,summary,maxCharacters}`. Returns per-result `url/title/publishedDate/author/score/highlights`. |
| Exa find similar | POST | `https://api.exa.ai/findSimilar` | Seed URL → independent corroborating pages (for §10 prosecutor/skeptic fan-out). `url` (req), `numResults`, `contents`, `excludeSourceDomain`. |
| OpenAlex works search | GET | `https://api.openalex.org/works` | `search=` OR `filter=default.search:|title.search:|fulltext.search:`; also `filter=publication_year:`,`type:review`,`is_oa:true`; `select=`, `per-page=`, `api_key=`. Returns `id, doi, title, publication_year, type, cited_by_count, open_access`, `meta.cost_usd`. |
| OpenAlex single work | GET | `https://api.openalex.org/works/{id}` | Re-fetch by OpenAlex ID, DOI (`works/doi:10.x/...`), PMID. **Singleton GETs are FREE.** `api_key=`. |
| S2 paper relevance search | GET | `https://api.semanticscholar.org/graph/v1/paper/search` | `query` (req), `fields=` (title,abstract,year,citationCount,influentialCitationCount,publicationTypes,externalIds,openAccessPdf,isOpenAccess,tldr,fieldsOfStudy,venue), `limit,offset,year,publicationTypes,fieldsOfStudy,openAccessPdf,minCitationCount`. |
| S2 bulk search | GET | `https://api.semanticscholar.org/graph/v1/paper/search/bulk` | **Recommended for keyword crawls** — sorting + boolean `+ \| -` syntax; paginate via `token`. `query, fields=, sort=citationCount:desc, year=, publicationTypes=, token=`. |
| S2 paper detail | GET | `https://api.semanticscholar.org/graph/v1/paper/{paper_id}` | Re-fetch by S2 id, `DOI:10.x`, `ARXIV:`, `PMID:` for §3 locator confirmation. `fields=`. |

### Query strategy for Warden (hazard/chemical → literature)
Given a hazard/chemical from a core source (e.g. "PFAS" from EPA UCMR, "phthalates"/"lead paint" from a product/Prop 65 finding):
1. **OpenAlex** — `GET /works?search=<chemical>+<pathway>&filter=type:review&sort=cited_by_count:desc` → strongest peer-reviewed evidence; read `type` (review/article) + `cited_by_count` for tier; `doi` = citation.
2. **Semantic Scholar** — `GET /paper/search/bulk?query=<chemical> <pathway>&fields=publicationTypes,citationCount,influentialCitationCount,tldr,externalIds&publicationTypes=Review,MetaAnalysis` → tier (MetaAnalysis/Review > JournalArticle) + a one-line `tldr`.
3. **Exa** — `POST /search` with `category:"research paper"` or `includeDomains` of regulators/journals → NGO/journalism/preprint corroboration the scholarly graphs miss, with primary URLs.
Cross-source agreement raises confidence; disagreement feeds the §10 prosecutor/skeptic record.

### Response → dossier mapping
- **OpenAlex /works (VERIFIED):** `{meta:{count,cost_usd,...}, results:[{id:"https://openalex.org/W2968829238", doi:"https://doi.org/10.1016/j.envres.2019.108648", title, publication_year:2019, type:"review", cited_by_count:654, open_access:{...}}]}`. → evidence tier from `type`+`cited_by_count`; `source.url = id` (or doi); `source.locator =` DOI/OpenAlex work ID.
- **S2 /paper/search:** `{total, offset, next, data:[{paperId, title, year, citationCount, influentialCitationCount, publicationTypes:["Review"|"MetaAnalysis"|"JournalArticle"...], externalIds:{DOI,ArXiv,PubMed}, isOpenAccess, openAccessPdf:{url}, tldr:{text}, venue}]}`. → tier from `publicationTypes`+`citationCount`; `source.url = openAccessPdf.url` or `https://www.semanticscholar.org/paper/{paperId}`; locator = DOI/paperId.
- **Exa /search:** `{results:[{id,url,title,publishedDate,author,score,text,highlights[],highlightScores[],summary}], costDollars}`. → `source.url = url`; locator = a highlight snippet/anchor; **`score` grades relevance, NOT truth.**
- `hazard_type` stays from the core source; **these three only set `confidence`/`severity_basis` support** (never `hazard_type`, never tier).

### Stable citation (§3)
All three stable. **Prefer DOI-based re-fetch** for §3 confirmation:
- OpenAlex: `id` (`https://openalex.org/Wxxxx`) + `doi`; re-fetch `GET /works/doi:<doi>` (FREE singleton) to confirm title/type/citations.
- S2: `https://www.semanticscholar.org/paper/{paperId}` or `externalIds.DOI`; re-fetch `/paper/{id}`.
- Exa: the result `url` (a real third-party page) — but 🚩 **Exa's own URL is NOT the canonical citation; the underlying page is, and it can move.** Use the DOI when `category=research paper` returns one.

### Example requests
```bash
# OpenAlex (VERIFIED, no key, DEMO-ONLY)
curl "https://api.openalex.org/works?filter=default.search:PFAS%20drinking%20water&select=id,doi,title,publication_year,type,cited_by_count,open_access&per-page=1"
# -> W2968829238, doi 10.1016/j.envres.2019.108648, type "review", cited_by_count 654, meta.cost_usd 0.001
# For the BUILD CRAWL add &api_key=YOUR_KEY

# Semantic Scholar (needs key; will 429 unauthenticated)
curl -H "x-api-key: $S2_KEY" "https://api.semanticscholar.org/graph/v1/paper/search?query=phthalates+children&fields=title,year,citationCount,influentialCitationCount,publicationTypes,externalIds,tldr&limit=5"

# Exa (needs key)
curl -X POST https://api.exa.ai/search -H "x-api-key: $EXA_KEY" -H "content-type: application/json" \
  -d '{"query":"PFAS drinking water health evidence","category":"research paper","numResults":5,"contents":{"highlights":true,"text":{"maxCharacters":1000}}}'
```

### Freshness
OpenAlex & S2 are continuously-updated scholarly graphs (new works/citations land daily; **citation counts drift** — treat `cited_by_count`/`citationCount` as as-of-fetch and timestamp them, since evidence tier can shift). No simple "only-new-since-X" topic feed, but filter OpenAlex by `from_publication_date:`/`from_created_date:` and S2 by `year=`. Exa reflects the live web at query time (`publishedDate` per result). **None of these triggers a new ACT/ADDRESS finding — the core regulatory sources do.**

### Rate limits
- EXA: free ≤ 20,000 req/month; no hard RPS published; usage-billed beyond free.
- OPENALEX: max 100 req/s; credit-based — no key ~$0.01/day then 409; free key $1/day (~1,000 searches/day); singleton GET free, list $0.0001, search $0.001 (confirmed via `meta.cost_usd`).
- S2: unauthenticated ~5,000 req/5min collectively but **heavily throttled (429 immediately in testing)**; keyed accounts start at **1 req/s** on `/paper/search`, `/paper/batch`, `/recommendations` and 10 rps elsewhere. **Throttle S2 ≤1 rps, batch, cache aggressively.**

### Joins
No geo/ZIP join. Join is **hazard/chemical → literature:** take the chemical name / `hazard_type` from a core finding (CPSC recall reason, Prop 65 chemical, EPA UCMR analyte "PFOA"/"PFOS") + exposure pathway/medium ("drinking water", "house dust", "children") as the query. **Dedupe corroborating papers across OpenAlex/S2 by `externalIds.DOI` / `ids.doi`.** Consider normalizing chemicals via CAS to disambiguate, though these APIs index on free text + DOI, not CAS.

### Gotchas
- 🚩 **OpenAlex changed its access model Feb 13 2026: keys now required; the free `mailto`/polite-pool is GONE.** Old `mailto=` code silently loses its benefit; keyless = ~$0.01/day (~10 searches) before 409. **Get a free key for the build crawl.** Keyless is only viable for a single live demo call.
- 🚩 **S2 will NOT issue keys to free email domains (gmail/outlook) or 3rd-party apps (as of Aug 2024) — the project email `fztmon@gmail.com` is gmail, so the key request may be rejected.** Plan B: institutional/custom-domain email, or run S2 unauthenticated with heavy caching + ≤1 effective rps + tolerate 429 backoff.
- 🚩 **Do NOT put S2 on the runtime hot path** — unauthenticated calls can 429 on the very first request. Pre-compute in the build harness; cache.
- 🚩 Exa is genuinely paid beyond 20k/month and bills per result/content — its `url` is a discovery pointer, not always a canonical citation; for §3 prefer the DOI.
- 🚩 **Citation counts differ between OpenAlex and S2 for the same DOI** (different coverage) — don't treat either count as ground truth; use publication TYPE (review/meta-analysis vs preprint) as primary tier signal, citation count as secondary tiebreaker, and **record which source said what (§10).**
- 🚩 **None of these is a regulatory source — they can NEVER upgrade a finding to ACT.** Confidence/`severity_basis` support only. Keep `origin=ai_inferred` for hazards these surface in §11 contextual discovery.

> **§11 note:** These scholarly/neural sources sit OUTSIDE the §11 grounding allowlist by design. Per §11, **a single peer-reviewed primary study NEVER establishes a route** — §7's hierarchy grades evidence STRENGTH on an already-established route, not route reality. Tier-3 (NGO/journalism/preprint, incl. anything Exa surfaces off-allowlist) = corroborating only, never sufficient to ground a pathway.

---

## 6. FDA / USDA recall + consumer-settlement stretch sources (extensible stubs)

**Confidence:** `verified_official_docs` for openFDA; **FSIS field schema is INFERRED**; settlement sites are scrape-only.
**Feeds tier:** **ACT** (active recalls owned → stop use/refund; open settlements → file claim). Recall classification → `severity_basis`; ADDRESS/AWARE for terminated/older recalls. **Profiled as extensible stubs** (stretch, per rubric "Sources").

### Access
- **Method:** mixed (REST + HTML scrape).
- **Base URLs:** openFDA (primary) `https://api.fda.gov/food/enforcement.json` ; USDA-FSIS Recall API `https://www.fsis.usda.gov/fsis/api/recall/v/1` ; Settlement sites: **no API, HTML scrape only** (`https://openclassactions.com/`, `https://topclassactions.com/`, `https://www.classaction.org/`).
- **Auth:** **none required** (openFDA optional key raises limits — see below). HTTPS only for openFDA.

### Endpoints
| Name | URL | Notes |
|------|-----|-------|
| **openFDA Food Enforcement — PRIMARY** | `https://api.fda.gov/food/enforcement.json` | FDA Recall Enterprise System (RES) food recalls, 2004–present, **updated WEEKLY**. Each record = one recalled product with a stable `recall_number`. Params: `search=` (Lucene field queries, e.g. `search=recalling_firm:"acme"+AND+classification:"Class+I"`), `limit=` (max 1000), `skip=` (pagination, max 25000; use `search_after` deeper), `sort=` (e.g. `report_date:desc`), `count=` (facets, e.g. `count=classification.exact`). **Phrases need quotes + URL-encoding; AND/OR uppercase.** |
| openFDA Drug Enforcement | `https://api.fda.gov/drug/enforcement.json` | Same RES schema for drug recalls. Stub — relevant for OTC meds/supplements. Identical query grammar. |
| openFDA Device Enforcement | `https://api.fda.gov/device/enforcement.json` | Same RES schema for medical-device recalls. Stub. Identical grammar. |
| USDA-FSIS Recall & Public Health Alert API | `https://www.fsis.usda.gov/fsis/api/recall/v/1` | FSIS meat/poultry/egg recalls + public health alerts (JSON, attribute-based). Covers food categories FDA does NOT. 🚩 **Field-level schema is INFERRED** (gov site blocks automated doc fetch; HTTP 403). Reported Drupal-style filters: `field_recall_number`, `field_year_id`, `field_states_id`, `field_recall_classification`. **VERIFY exact param names against live JSON + the `Recall-API-documentation.pdf` before relying.** |
| Class-action settlement/claim aggregators | `https://openclassactions.com/settlements.php` (+ topclassactions.com, classaction.org, claimdepot.com) | **No public API on any major aggregator.** Each open settlement has a dedicated deep-linkable page (eligibility, proof, payout, deadline, OFFICIAL claim-form URL). 🚩 **Lowest citation stability — cite the official settlement administrator page these aggregators link to, NOT the aggregator card.** Scrape stub; respect robots.txt/ToS. |

### Query strategy for Warden (product/brand owned → recall/settlement)
- openFDA: `search=recalling_firm:"BRAND"` or `search=product_description:"KEYWORD"` (URL-encode, quote phrases) on `/food/enforcement.json`; add `+AND+classification:"Class+I"` to prioritize most serious; `sort=report_date:desc` for recency.
- USDA-regulated foods (meat/poultry/egg): repeat against FSIS.
- Settlements: match product/brand/data-breach-vendor name against scraped open-settlement listings, then resolve to the official claim administrator page for the citable action ("file claim by DEADLINE").
- `classification` → `severity_basis` (**Class I = serious health consequence/death; II = temporary/reversible; III = unlikely harm**). `status` (Ongoing/Terminated) → ACT vs AWARE tiering.

### Response → dossier mapping
- **openFDA (CONFIRMED from live record):** `meta{disclaimer,terms,license,last_updated,results{skip,limit,total}}` + `results[]`. Per-record: `recall_number` (STABLE unique id, e.g. `"F-0609-2015"` → **`source.locator`**), `product_description` (→ `item` match), `reason_for_recall` (→ `hazard_type`), `classification` "Class I/II/III" (→ `severity_basis`), `status` (Ongoing|Completed|Terminated|Pending → ACT vs AWARE), `recalling_firm`, `recall_initiation_date` + `report_date` (**YYYYMMDD strings, not ISO**), `distribution_pattern` + state/city/country (geo), `code_info`/`product_quantity` (lot match), `voluntary_mandated`, `initial_firm_notification`, `event_id`, `openfda{}` (often empty for food). 🚩 **Pre-June-2012 records lack `event_id`/`status`/`state`/`voluntary_mandated`/`recall_initiation_date`.**
- **FSIS (INFERRED):** JSON keyed by Drupal `field_*` names (`field_title`, `field_recall_number`, `field_recall_date`, `field_summary`/`field_recall_reason`, `field_recall_classification`, `field_states`, `field_product_items`, `field_active_notice`) — **confirm live.**
- 🚩 **`action` MUST be quoted from the recall notice itself** ("stop use / return for refund") — never originated by Warden (§7 compliance).

### Stable citation (§3)
- **openFDA — STRONG.** (1) Re-fetchable API locator: `https://api.fda.gov/food/enforcement.json?search=recall_number:%22F-0609-2015%22` — `recall_number` is unique/persistent, so the fact is re-confirmable forever (`source.url` + `source.locator=recall_number`). (2) Human-readable FDA recall press page, but the API query is the more durable machine locator.
- **USDA-FSIS — MODERATE-STRONG.** `recall_number` = locator; individual notices live at `https://www.fsis.usda.gov/recalls-alerts/<slug>`. 🚩 **Slug is NOT derivable from `recall_number` — persist the URL returned by the API.**
- **Settlement sites — WEAK.** Aggregator cards are volatile (re-sorted, expire when the deadline passes). Dereference to the official settlement administrator domain; pin claim deadline + settlement name; **record a retrieved-at timestamp** (pages are taken down post-deadline).

### Example requests
```bash
# Current serious open food recalls
curl 'https://api.fda.gov/food/enforcement.json?search=classification:%22Class+I%22+AND+status:%22Ongoing%22&sort=report_date:desc&limit=5'

# Pin one fact for citation
curl 'https://api.fda.gov/food/enforcement.json?search=recall_number:%22F-0609-2015%22'

# With optional key (raises 1k/day -> 120k/day): append &api_key=YOUR_KEY
```

### Freshness
- openFDA Food Enforcement: **WEEKLY** from RES (`meta.last_updated`, e.g. `2026-06-03`). Incremental: `sort=report_date:desc` + high-water-mark on `report_date`, or `search=report_date:[YYYYMMDD+TO+YYYYMMDD]`.
- FSIS: updated as recalls issue; filter `field_recall_date` / `field_active_notice=True` for currently-open recalls.
- Settlements: updated daily-ish; the **claim-by deadline** is the freshness signal that flips a finding ACT → expired.

### Rate limits / auth
- openFDA: **240/min + 1,000/day (no key); 240/min + 120,000/day (free key).** Get key at `https://open.fda.gov/apis/authentication/` (instant email signup, no approval). Pass as `?api_key=KEY` or HTTP basic-auth username. Optional but recommended for the build crawl.
- FSIS: no documented hard limit (be polite; Drupal-backed).
- Settlement scrape: self-throttle, respect robots.txt.

### Joins
🚩 Product→recall is **fuzzy: no UPC/GTIN field in RES** — match user item text against `product_description` + `code_info` (lot/UPC strings sometimes embedded in `code_info`); `recalling_firm` gives the brand join. Geo: `distribution_pattern` + `state` scope whether a recall reached the user's region (supports ADDRESS conditioning). **Jurisdiction routing:** meat/poultry/egg → FSIS; everything else (produce, packaged food, supplements, cosmetics) → openFDA. Settlement join: match brand/vendor/breach-entity name against settlement title, confirm eligibility against the stated class definition.

### Gotchas
- 🚩 openFDA is **NOT real-time** — weekly batch; a brand-new recall may not appear for days. **Do not present absence as "safe"** (matches Warden's record-state stance).
- Phrase searches **MUST be double-quoted AND URL-encoded; boolean AND/OR/NOT uppercase.** Unquoted multi-word terms silently OR the tokens and inflate results.
- `skip` capped at 25,000 — for deep pagination use `search_after` (cursor).
- Pre-June-2012 RES records lack `status`/`state`/`voluntary_mandated`/`recall_initiation_date`/`event_id` — handle missing fields.
- Dates are **YYYYMMDD strings, not ISO** — parse accordingly.
- 🚩 **FDA vs USDA jurisdiction split is a real coverage gap** — meat/poultry/processed-egg recalls are NOT in openFDA; must also query FSIS or you'll miss them.
- 🚩 **FSIS field-level schema is INFERRED** (the `.usda.gov` site blocked automated doc fetches with HTTP 403) — verify param/field names against live JSON + the official PDF before building.
- 🚩 **Settlement aggregators have NO API + weak citation stability** — cards expire/re-sort; always dereference to the official settlement administrator page + capture retrieved-at timestamp. Aggregators can be SEO/affiliate-driven — discovery layer only, never the cited authority.
- `recall_number` is the join/locator key but is FDA-specific; **does NOT correspond to UPC/GTIN** — product-to-recall matching relies on fuzzy `product_description`/`code_info`; `confidence` must reflect match uncertainty.

> **§11 note:** `api.fda.gov`/`fda.gov` and `fsis.usda.gov` are **NOT** on the §11 allowlist as written — they cannot ground §11 pathways but are valid §3 confirmation sources for user-listed products. Settlement aggregators are Tier-3/4 (never admissible for grounding; weak even as citation).

---

## Cross-source summary

### Stable-citation strategy by source (the §3 backbone)
| Source | `source.url` | `source.locator` (pins the fact) | Re-fetch confirmation |
|--------|--------------|-----------------------------------|------------------------|
| CPSC | recall `URL` field | `RecallNumber` (+ `Hazards[i].Name` for sub-fact) | `?format=json&RecallNumber=<n>` → exactly 1 record |
| EPA SDWA (system) | `WaterSystems[].DfrUrl` (`?fid=<FRS_RegistryID>`) | `PWSID` | `get_systems?p_pid=<PWSID>&passthrough=Y` |
| EPA SDWA (violation) | bulk ZIP URL / DFR | `VIOLATION_ID` + `SUBMISSIONYEARQUARTER` + `PWSID` | re-download quarterly bulk, filter row |
| EPA UCMR PFAS | Occurrence Data page / ZIP URL | `{PWSID, Contaminant, SamplePointID, CollectionDate, value}` + cycle `UCMR5` | re-download + filter, or Data Finder |
| EPA facility | `echo.epa.gov/detailed-facility-report?fid=<RegistryID>` | 12-digit FRS RegistryID | ECHO `get_qid` / FRS `get_facilities` |
| Prop 65 AG notice | `oag.ca.gov/prop65/60-Day-Notice-{AG#}` | AG Number `YYYY-NNNNN` | per-notice page + `.../notices/{AG#}.pdf` |
| OEHHA list | `oehha.ca.gov/proposition-65/proposition-65-list` | chemical name + list-rev date (e.g. 2025-12-05) | re-scrape landing page (content mutates in place) |
| OpenAlex | work `id` / `doi` | DOI or OpenAlex W-id | `GET /works/doi:<doi>` (FREE) |
| Semantic Scholar | `semanticscholar.org/paper/{paperId}` / DOI | paperId / DOI | `GET /paper/{id}` |
| Exa | result `url` (underlying page, can move) | highlight snippet (prefer DOI if present) | re-fetch page / DOI |
| openFDA | `api.fda.gov/.../enforcement.json?search=recall_number:"<n>"` | `recall_number` (e.g. `F-0609-2015`) | same query → re-confirms record |
| USDA-FSIS | persisted notice URL `fsis.usda.gov/recalls-alerts/<slug>` | `recall_number` | live API by recall_number |
| Settlement | official administrator page (NOT aggregator) | settlement name + claim deadline + retrieved-at | re-fetch admin page (may be taken down post-deadline) |

### Build priority
1. **Core (build first):** CPSC (#1) · Prop 65 (#4) · EPA water + PFAS/ECHO (#2, #3).
2. **Differentiator (act two):** independent confidence layer (#5) — Exa + OpenAlex + S2.
3. **Stretch (stubs, extensible):** FDA/USDA + settlements (#6).


---

## Appendix A — Key / auth matrix

| source | auth_required | what the user must provide (API key/account) | free-tier notes |
|--------|---------------|----------------------------------------------|-----------------|
| **CPSC Product Recalls (SaferProducts.gov REST)** | none | nothing | Fully open GET, no key/registration. Courtesy-throttle + cache; full corpus ~27 MB so use date filters. (Avoid the `data.cpsc.gov` Socrata host, which WOULD need an app token.) |
| **EPA ECHO SDWA REST + SDWIS bulk** | none | nothing | Fully open GET + static bulk ZIP. No quota; just respect the result-set cap (always pass `p_st`+`p_co` or `p_pid`) and the ~30-min QID TTL. |
| **EPA PFAS/UCMR 5 + ECHO/FRS facilities** | none | nothing | All public, no key. UCMR bulk text files preferred over hammering REST. FRS ORDS backend slow/flaky — use `-L`, retries, low concurrency. |
| **CA Prop 65 — OEHHA list + AG 60-day notices** | none (read) | nothing for reading; a browser-session/cookie or Playwright driver to defeat the OEHHA Incapsula bot-wall (not a credential) | Both free public gov sites. `oag.ca.gov` works with plain curl. `oehha.ca.gov` Incapsula-gated on repeat scripted hits — engineering effort, not an account. |
| **Exa (neural search)** | **api_key** | **Exa API key** from `dashboard.exa.ai/api-keys` (header `x-api-key`) | Free tier up to 20,000 req/month; paid usage-based beyond (Search $7/1k, Contents $1/1k, Deep $12/1k). **Issue #002.** |
| **OpenAlex** | **api_key (as of Feb 13 2026)** | **Free OpenAlex API key** from `openalex.org/settings/api` (`?api_key=`) | Free key → $1/day free (~1,000 searches/day). Keyless = ~$0.01/day (~10 searches) then 409 — demo-only. `mailto` polite-pool is DEPRECATED. |
| **Semantic Scholar** | api_key (optional but effectively required) | **S2 API key** via `semanticscholar.org/product/api#api-key-form` (header `x-api-key`) — ⚠️ **gmail.com (the project email) is likely rejected; need an institutional/custom-domain email** | Keyed accounts start at only 1 req/s. Unauthenticated pool 429s on the first call. Plan B: run unauthenticated with heavy caching + ≤1 rps + 429 backoff, pre-computed in the harness (never on the runtime hot path). |
| **FDA openFDA (food/drug/device enforcement)** | none (key optional) | nothing required; an **optional free openFDA key** (`open.fda.gov/apis/authentication/`, instant signup) raises limits 1k→120k/day | Without key: 240/min + 1,000/day. With free key: 240/min + 120,000/day. Recommended for the build crawl. |
| **USDA-FSIS Recall API** | none | nothing | Open JSON, no key. Be polite (Drupal-backed). Field schema INFERRED — verify before relying. |
| **Class-action settlement aggregators** | none | nothing | No API; HTML scrape only, respect robots.txt/ToS. Cite the official settlement administrator page, not the aggregator. |
| **Supabase (findings store — not a source)** | account | **Supabase project + connection string/keys** | Issue #004 (P0). Infra dependency, not a data source. |
| **Anthropic API (the harness LLM — not a source)** | account | **Anthropic API key** for the Python Agent SDK harness | Issue #003 (P0). Infra dependency, not a data source. |
| **Vercel (runtime/deploy — not a source)** | account | **Vercel connect** (`vercel login` → `vercel link`, browser OAuth) | Issue #005 (P1). Infra dependency, not a data source. |


## Appendix B — Harness implications

- ZIP->PWSID is the single biggest integration gotcha (Issue #007): there is NO reliable direct ZIP->water-system API. p_zip returns 0 rows for valid residential ZIPs and ZipCodesServed is null for most systems. The harness MUST cache a ZIP->county+FIPS crosswalk (US Census ZCTA-to-county or HUD USPS ZIP-county), then call sdw_rest_services.get_systems by p_st+p_co, then disambiguate the user's provider by PWSTypeCode=CWS + largest PopulationServedCount + CitiesServed match. Build this lookup table at harness-setup time, not per-request. (Note: UCMR5_ZIPCodes.txt gives a SEPARATE, more direct ZIP->PWSID map for PFAS specifically — use that for the PFAS path, county-crosswalk for the general SDWA path.)
- Two distinct PWSID resolution paths must coexist: (a) general SDWA violations via ECHO get_systems keyed through the county crosswalk, and (b) PFAS detections via UCMR5_ZIPCodes.txt direct ZIP->PWSID. Both converge on the same PWSID key, so the schema should make PWSID the join column across SDWA + UCMR + ECHO/FRS facilities. FRS RegistryID == ECHO RegistryID is the cross-system facility key for DFR deep links.
- Bulk-file ingestion is mandatory, not optional: the EPA SDWA REST API returns only COUNTS + 3-year contaminant summaries, so per-VIOLATION_ID findings REQUIRE parsing SDWA_VIOLATIONS_ENFORCEMENT.csv from the quarterly ZIP, joined to reference/lookup tables (CONTAMINANT_CODE/VIOLATION_CODE are coded integers). Same for UCMR5_All.txt (PFAS detections, >1M rows -- load via pandas/DB with ID columns as text to preserve leading zeros, use the by-state/by-method split ZIPs). The harness needs a quarterly bulk-refresh job distinct from the live-query path, with dataset-version capture for provenance.
- CPSC supports keyword + structured-field query, so item-matching is feasible directly against the live API -- but there is no global free-text param and params are AND-combined, so the harness must fan out across Manufacturer + Importer + Distributor (import recalls have empty Manufacturers[]) and ProductName + RecallTitle + RecallDescription, then merge by RecallID. Model numbers and UPCs are mostly empty, so matching is brand+product-noun keyword with Description-text confirmation; confidence must encode match uncertainty. Use RecallID as DB primary key, RecallNumber as the citation token, LastPublishDateStart for incremental sweeps.
- Default-format trap: CPSC defaults to XML and EPA get_download defaults to erroring on JSON -- the harness HTTP layer must always set format=json (CPSC) and must NOT pass output=JSON to get_download (CSV only). Param-name precision matters: EPA PWSID param is p_pid (not p_pwsid); wrong names are silently ignored and then trip the 433,698-row queryset-limit error -- a silent failure mode the harness should detect (treat the queryset-limit error as a misconfigured-query signal, not an empty result).
- openFDA query grammar is strict: phrases double-quoted AND URL-encoded, AND/OR/NOT uppercase, dates are YYYYMMDD strings (not ISO), skip capped at 25,000 (use search_after for deep pagination). Pre-June-2012 records miss status/state/event_id fields. Jurisdiction routing is load-bearing: meat/poultry/egg -> FSIS, everything else -> openFDA, or recalls are silently missed.
- OEHHA Incapsula bot-wall forces a browser-driver fallback (Playwright) or cookie-honoring session for the Prop 65 chemical-list download -- a plain requests/httpx GET will intermittently get a 212-byte JS-challenge HTML page (content-type text/html, contains _Incapsula_Resource) instead of the xlsx. The harness must detect this (wrong content-type) and retry via browser session. Pull the OEHHA list at most once/crawl/day and cache it (it drives is_ubiquitous for every product). oag.ca.gov has no such wall -- query it on demand.
- Prop 65 is the is_ubiquitous calibration backbone (§5): the harness must load the OEHHA list into a NAME-keyed lookup (NO CAS column in the safe-harbor export, so name normalization across synonyms/salts/'and its compounds' families is required) and default warning-only/listing-only hits to is_ubiquitous=true / CONTEXT. Escalation to ADDRESS/AWARE requires a matching AG 60-day notice (an ALLEGATION, so wording must say 'alleged Prop 65 violation notice', never a proven violation). The AG chemical dropdown uses internal taxonomy term ids (field_prop65_chemical_tid) -- harvest the id->name map once at setup.
- The §11 open-inference judge assigns source tier from a hardcoded eTLD+1 domain ALLOWLIST, and as written today only *.epa.gov (Tier-1) and oehha.ca.gov (Tier-2) among Warden's sources are on it. CPSC/saferproducts.gov, api.fda.gov/fda.gov, fsis.usda.gov, and oag.ca.gov are NOT on the allowlist, so they CANNOT ground a §11 pathway as-is. ACTION: either (a) extend the §11 Tier-1/2 allowlist to include these federal/state regulator domains (recommended -- they are genuine regulatory sources), or (b) accept that §11 pathway-grounding flows only through EPA water/PFAS + OEHHA. This is a design decision the builder must make explicitly; until then, §11 grounding is EPA/OEHHA-only. Note these domains remain fully valid for §3 product-list finding confirmation (re-fetch + content match), which does NOT use the §11 allowlist.
- Confidence layer must be pre-computed in the build harness, never on the runtime hot path: Semantic Scholar 429s on the first unauthenticated call and keyed accounts are 1 req/s; OpenAlex now needs a key (keyless = ~10 calls/day). Throttle S2 <=1 rps, dedupe OpenAlex/S2 by externalIds.DOI, use publication TYPE (review/meta-analysis) as the primary evidence-tier signal with citation count as a secondary tiebreaker (counts DIFFER between the two graphs for the same DOI), and record which graph said what for the §10 prosecutor/skeptic/adjudicator record. These three NEVER upgrade a finding to ACT and NEVER set hazard_type -- confidence/severity_basis support only; keep origin=ai_inferred for §11-surfaced hazards.
- Absence-is-not-safety must be enforced at the data layer, matching Warden's stance: UCMR reports ONLY results >= MRL (null/'<' = non-detect, not missing); systems serving <3,300 people are largely unsampled; openFDA and SDWIS lag reality (weekly batch / 1-2 quarter quarterly reporting). The harness must surface as-of timestamps/dataset versions on every finding and the runtime must render absence as a neutral timestamped record statement, never an all-clear. Capture meta.last_updated (openFDA), Results.Version 'SDWA v2020-02-05 1500' (ECHO), the UCMR5 cycle + download date, and the OEHHA list-revision date as provenance.
- Stable citation strategy is per-source and must be wired into the writer: CPSC -> RecallNumber re-query; EPA system -> DfrUrl(fid)+PWSID; EPA violation -> VIOLATION_ID+SUBMISSIONYEARQUARTER+PWSID; UCMR -> {PWSID,Contaminant,SamplePointID,CollectionDate}+UCMR5 cycle; AG notice -> 60-Day-Notice-{AG#} page + AG Number; OEHHA -> list page + chemical name + revision date; openFDA -> recall_number re-query; scholarly -> prefer DOI re-fetch over Exa's url. The §3 verifier re-fetches each and confirms hazard_type+identifier at/near the locator. Several locators are composite keys, not single IDs (EPA violation, UCMR) -- the source.locator field must hold structured/composite values, and DFR/UCMR human pages are JS-rendered so the locator (not a URL anchor) carries the fact, backed by the machine-readable REST/bulk layer.
- FRS get_facilities live response is UNVERIFIED (sandbox call timed out) and the FSIS field schema is INFERRED (403 on docs) -- the builder must live-verify both before relying. ECHO get_facilities->get_qid IS verified and is the preferred facility path; treat FRS as the cross-program complement (use -L for the ofmpub->frs-public 302 redirect, all 3 of latitude83/longitude83/search_radius required, radius <=25mi). Settlement aggregators have NO API and weak citation stability -- build as a scrape stub only, always dereference to the official settlement-administrator page, capture retrieved-at (pages vanish post-deadline).


## Appendix C — Open questions (decisions needed)

- Semantic Scholar key acquisition is uncertain: S2 rejects free-email-domain (gmail) key requests as of Aug 2024 and the project email is fztmon@gmail.com. Does the user have an institutional/custom-domain email to obtain a key, or should the harness commit to the Plan-B unauthenticated+heavy-cache+<=1rps fallback (pre-computed only, never runtime)? This gates §7 throughput.
- §11 domain allowlist scope: should the Tier-1/2 allowlist be extended to include cpsc.gov/saferproducts.gov, api.fda.gov/fda.gov, fsis.usda.gov (federal regulators) and oag.ca.gov (CA AG enforcement)? As written, only *.epa.gov and oehha.ca.gov can ground §11 pathways, which limits open-inference grounding to water/PFAS + OEHHA chemicals. Builder design decision -- recommend extending to genuine regulator domains.
- Which ZIP->county crosswalk to standardize on (US Census ZCTA-to-county relationship file vs HUD USPS ZIP-county crosswalk)? They differ on multi-county ZIPs; the choice affects which PWS get surfaced for the ADDRESS tier. Needs a decision + a cached static table at harness setup (Issue #007).
- FSIS Recall API field schema is INFERRED (gov docs 403'd) -- needs a live-JSON verification pass to confirm the exact Drupal field_* param/field names before the FDA/USDA stretch source is built. Stretch-tier, so lower urgency, but flagged so it isn't trusted as-is.
- FRS get_facilities live behavior is UNVERIFIED (timed out in recon). Is the ECHO get_facilities->get_qid path sufficient for the §11 facility-proximity discovery (it IS verified), making FRS optional, or is FRS's pgm_sys_acrnm program-filtering needed enough to justify hardening against its slow/flaky ORDS backend?
- Settlement-claim sources have no API and weak citation stability -- is the settlement-claim ACT path (file-claim-by-deadline) in scope for the demo, or deferred as a pure stub? If in scope, a scrape + official-administrator-dereference pipeline with retrieved-at timestamps is needed, which is materially more work than the API sources.
- Live-crawl vs precomputed boundary for the demo (§E/§A): which sources are hit live within the <=8s runtime budget vs served from the Supabase precompute? EPA bulk parsing and the scholarly confidence layer clearly must be precomputed; CPSC and AG-notice queries are fast enough to consider live. Needs an explicit per-source live/precompute mapping tied to the latency budget.
