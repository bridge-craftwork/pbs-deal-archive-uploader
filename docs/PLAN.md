# Plan: BBO Deal Archive Uploader — Browser Extension

A Chrome extension (Manifest V3) for any BBO user: pick scenarios, choose deal count and Random/Sequential, click Upload. The extension fetches scenario PBNs from a hosted URL, converts to LIN in-browser, and uploads into the user's Deal archive using their existing logged-in BBO session — no separate login or automation framework needed.

## Architecture

```
GitHub Pages (index.json + *.pbn)
        │ fetch
        ▼
Extension UI (popup/side panel) ── select, count, mode ──► JS: parse PBN → select/shuffle → build .lin
        │
        ▼
Content script on bridgebase.com ── performs upload in user's logged-in session ──► Deal archive
```

Two deliverables: a **scenario host** (static site) and the **extension** itself.

## 1. Scenario hosting

- Static site (GitHub Pages) serving `index.json` + one `.pbn` per scenario, generated from `bba-filtered/`.
- `index.json`: `[{ "name", "file", "dealCount", "description" }]`.
- Small build script (Python or Node) regenerates `index.json` and copies PBNs whenever scenarios change — push to update all users, no extension release needed.
- CORS: GitHub Pages sends `Access-Control-Allow-Origin: *`, so the extension can fetch directly.

## 2. Extension structure (MV3)

- `manifest.json` — `host_permissions`: `https://*.bridgebase.com/*` + the scenario host; permissions: `storage`, `sidePanel` (or popup).
- **UI**: side panel (preferred — stays open during upload) listing scenarios with deal counts (checkboxes), deal-count input, Random/Sequential radio with *start at nnn*, Upload button, progress/status area, and a "download .lin instead" fallback link.
- **Core logic** (shared JS module, no dependencies): PBN parser, deal selector/shuffler, LIN writer.
- **Content script / service worker**: executes the upload against bridgebase.com.
- Cache `index.json` and fetched PBNs in `chrome.storage.local` with a freshness check; remember last-used settings.

## 3. Deal selection & shuffle

- Total deal count, split as evenly as possible across selected scenarios (remainder to the first scenarios). Validate against available counts.
- Sequential: boards nnn..nnn+k−1 per scenario (nnn applies to each scenario independently).
- Random: sample without replacement per scenario.
- Multiple scenarios: Fisher–Yates shuffle of the combined list so scenarios interleave; renumber boards 1..N.

## 4. PBN → LIN conversion (in JS)

Per deal, from PBN `Dealer`, `Vulnerable`, `Deal` tags, emit:

```
qx|o1|md|<dealer><S hand>,<W hand>,<N hand>,<E hand>|rh||ah|Board 1|sv|<vul>|pg||
```

- Dealer → md digit: S=1, W=2, N=3, E=4; hands in S,W,N,E order, rotated from PBN's `Deal "N:..."` anchor; each hand `S...H...D...C...`.
- Vulnerable → sv: None=`o`, NS=`n`, EW=`e`, All=`b`; PBN `"-"` = None.
- Verify card-10 notation (`T`) and exact field set against a known-good file exported from BBO.

## 5. File naming

`<scenarios>_<N>deals_<rand|seq-nnn>_<YYYYMMDD-HHMM>.lin`, e.g. `weak2-multi_24deals_seq-37_20260603-1430.lin`; abbreviate when many scenarios (`5scenarios_...`). Same name used for the Deal archive entry.

## 6. Upload mechanism

- **Discovery (one-time, dev)**: with devtools on the BBO Deal archive upload page, capture the exact request the upload form sends (endpoint, method, multipart fields, folder/name parameters, any CSRF token).
- **Primary approach — direct request**: content script (or `fetch` with `credentials: 'include'` from extension context with host permission) POSTs the generated LIN exactly as the form would. User is already logged in, so session cookies ride along.
- **Fallback approach — drive the page**: open the Deal archive upload page in a tab, content script fills the form (set `<input type=file>` via `DataTransfer`, set name field, click submit). Use this if the endpoint requires page-bound tokens that are hard to replicate.
- Verify success by re-fetching the archive listing and confirming the new entry; report result in the panel.
- Error states: not logged in (detect, prompt user to log in to bridgebase.com), endpoint changed (offer .lin download), quota/size limits.

## 7. Validation & testing

- Unit tests (Vitest/Jest) for PBN parsing and LIN emission; round-trip check (52 cards, dealer, vul).
- Spot-check generated deals in BBO handviewer: `https://www.bridgebase.com/tools/handviewer.html?lin=...`.
- First end-to-end: 2-deal upload into a test archive folder on a test account.
- Cross-check on a second BBO account to confirm nothing is profile-specific.

## 8. Distribution

- Develop/iterate as an unpacked extension; ship as a **public Chrome Web Store listing**.
- Public listing requirements: store assets (icon 128px, screenshots, promo text), a privacy policy URL (state that the extension stores no personal data and only talks to bridgebase.com and the scenario host), single-purpose description, and justification for each host permission. Review takes days; keep host permissions minimal to avoid extended review.
- Since it's public, plan for support: a brief help page (how to log in to BBO first, where deals land in the archive) linked from the panel, and versioned releases so scenario-format changes don't strand old installs.
- Firefox port later if wanted (MV3 mostly compatible; side panel API differs).
- Note: this uses BBO's internal upload endpoint, not a public API — it may break if BBO changes their site. With a public listing, checking BBO's ToS (or simply asking BBO support) beforehand is strongly advised.

## 9. Build order

1. PBN parser + LIN writer + tests (pure JS module, reusable).
2. Scenario host: build script + index.json on GitHub Pages.
3. Upload discovery against BBO (devtools session) — riskiest unknown, do early.
4. Extension shell: manifest, side panel UI, fetch/cache, selection/shuffle.
5. Wire up upload + error handling.
6. Polish, second-account test, Web Store submission.

## Open questions

- Should random selection avoid deals a user has already received (per-user history in `chrome.storage`)?
- Does the Deal archive need a target-folder selector in the UI?
