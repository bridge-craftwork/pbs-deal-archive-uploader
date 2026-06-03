# Plan: PBS Deal Archive Uploader — Browser Extension

A Chrome extension (Manifest V3) for any BBO user: pick Practice Bidding Scenarios, choose deal count and Random/Sequential, click Upload. The extension fetches pre-converted LIN files from this repo, mixes deals from the selected scenarios, and uploads the result into the user's BBO Deal archive using their existing logged-in session.

## Key design decisions

- **Deal source**: `bba-filtered/` PBNs from the Practice-Bidding-Scenarios repo (curated deals where BBA bidding matched expectations).
- **Conversion happens at build time, not in the extension.** The existing `bridge-wrangler to-lin` tool converts each `bba-filtered/*.pbn` to an **unrotated** per-scenario `.lin`. The extension only selects, mixes, renumbers, and uploads — no PBN parsing in JS.
- **Hosting**: generated LINs + `index.json` are committed to this repo under `scenarios/` and fetched via `raw.githubusercontent.com` (public repo, CORS-friendly). Updating scenarios = rerun build script + push; no extension release needed.
- **Dealer/vulnerability are preserved as authored** (scenarios depend on who opens). Mixing only re-stamps the `qx|o{n}` index and `Board n` label.

## Architecture

```
Practice-Bidding-Scenarios/bba-filtered/*.pbn
        │  tools/build-scenarios.py (runs bridge-wrangler to-lin, writes index.json)
        ▼
this repo: scenarios/*.lin + scenarios/index.json  ──(raw.githubusercontent.com)──►
        ▼
Extension UI (side panel) ── select, count, mode ──► JS: pick deals → shuffle → renumber → build .lin
        ▼
Content script on bridgebase.com ── upload in user's logged-in session ──► Deal archive
```

## 1. Scenario build script (`tools/build-scenarios.py`)

- For each `bba-filtered/*.pbn`: run `bridge-wrangler to-lin`, write `scenarios/<name>.lin` (one board per line, `qx|o{n}|md|...` format).
- Generate `scenarios/index.json`: `[{ "name", "file", "dealCount", "description" }]`.
- Run on the Mac whenever scenarios change; commit + push publishes to all users.

## 2. Extension structure (MV3)

- `manifest.json` — `host_permissions`: `https://*.bridgebase.com/*`, `https://raw.githubusercontent.com/*`; permissions: `storage`, `sidePanel`.
- **UI**: side panel listing scenarios with deal counts (checkboxes + search filter — there are ~320), deal-count input, Random/Sequential radio with *start at nnn*, Upload button, progress/status, "download .lin instead" fallback.
- **Core logic**: plain JS module — LIN line splitter, deal selector, mixer/renumberer (port of `py/mix4v2.py` renumbering, minus dealer/vul re-stamping).
- Cache `index.json` and fetched LINs in `chrome.storage.local` with freshness check; remember last-used settings.

## 3. Deal selection & mixing

- Total deal count, split as evenly as possible across selected scenarios (remainder to the first scenarios). Validate against available counts.
- Sequential: boards nnn..nnn+k−1 per scenario (nnn per scenario, 1-based line number).
- Random: sample without replacement per scenario.
- Fisher–Yates shuffle of the combined list so scenarios interleave; re-stamp `qx|o{n}` and `ah|Board {n}|` as 1..N, keep `md` dealer digit and `sv` untouched.

## 4. File naming

`<scenarios>_<N>deals_<rand|seq-nnn>_<YYYYMMDD-HHMM>.lin`, e.g. `1N_Smolen_24deals_seq-37_20260603-1430.lin`; abbreviate when many scenarios selected (`5scenarios_...`). Same name used for the Deal archive entry.

## 5. Upload mechanism

- **Discovery (one-time, dev)**: with devtools on the BBO Deal archive upload page, capture the exact request the upload form sends (endpoint, method, multipart fields, folder/name parameters, any CSRF token).
- **Primary — direct request**: `fetch` with `credentials: 'include'` from extension context (host permission covers bridgebase.com) posting the generated LIN exactly as the form would. User is already logged in; session cookies ride along.
- **Fallback — drive the page**: open the Deal archive upload page in a tab; content script fills the form (set `<input type=file>` via `DataTransfer`, set name, click submit) if the endpoint needs page-bound tokens.
- Verify success by re-fetching the archive listing; report in the panel.
- Error states: not logged in (detect, prompt), endpoint changed (offer .lin download), size limits.

## 6. Validation & testing

- Unit tests (Vitest) for selection, mixing, renumbering.
- Diff a build-script LIN against a known-good `bridge-wrangler` output; spot-check deals in BBO handviewer (`https://www.bridgebase.com/tools/handviewer.html?lin=...`).
- First end-to-end: 2-deal upload to a test account; then a second account to confirm nothing is profile-specific.

## 7. Distribution — public Chrome Web Store listing

- Develop as unpacked; ship public.
- Listing needs: 128px icon, screenshots, promo text, privacy policy URL (no personal data stored; talks only to bridgebase.com and raw.githubusercontent.com), single-purpose description, host-permission justifications. Review takes days.
- Support: help page (log in to BBO first; where deals land) linked from the panel; versioned releases.
- Firefox port later if wanted.
- Note: uses BBO's internal upload endpoint, not a public API — may break if BBO changes their site. Check BBO ToS / ask BBO support before public launch.

## 8. Build order

1. `tools/build-scenarios.py` + publish `scenarios/` to this repo.
2. Core JS: selection/mixing/renumbering + tests.
3. Upload discovery against BBO (riskiest unknown — do early).
4. Extension shell: manifest, side panel UI, fetch/cache.
5. Wire up upload + error handling.
6. Polish, second-account test, Web Store submission.

## Open questions

- Should random selection avoid deals a user already received (per-user history in `chrome.storage`)?
- Does the Deal archive need a target-folder selector in the UI?
- Scenario descriptions for the UI — derive from existing PDFs/titles, or maintain in index.json by hand?
