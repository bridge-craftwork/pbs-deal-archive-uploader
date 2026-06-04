# PBS Deal Archive Uploader

A Chrome extension that lets Bridge Base Online users build practice sets from curated bidding scenarios and upload them to their BBO Deal archive.

Pick one or more scenarios, choose how many deals you want and whether they're selected randomly or sequentially, and click Upload. The extension fetches scenario deals (LIN format) from this repo, mixes deals from multiple scenarios together, creates a new Deal archive folder named `PBS-yymmdd-hh-mm-<scenarios>`, and imports the deals into it using your existing BBO login.

Scenario deals come from the curated [Practice-Bidding-Scenarios](https://github.com/ADavidBailey/Practice-Bidding-Scenarios) collection (`bba-filtered` — deals where the analyzed bidding matched the scenario's intent), pre-converted to LIN at build time and served from `scenarios/` in this repo.

## Install (development)

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin the "PBS Deal Archive Uploader" icon.

## Use

1. Log in at [bridgebase.com/v3](https://www.bridgebase.com/v3/) in a tab.
2. Click the extension icon — the side panel opens.
3. Check one or more scenarios (search box filters the ~320 available).
4. Set total deals, and Random or Sequential (starting board number).
5. Click **Upload to BBO Deal archive**. Watch progress in the panel; the BBO
   tab will visibly navigate to the Deal archive and import the file.
6. Find your deals in BBO under Account → Deal archive, in the new
   `PBS-…` folder. **Download .lin instead** saves the same file locally.

## Repo layout

- `extension/` — the MV3 Chrome extension (no build step; plain JS)
- `scenarios/` — published per-scenario LIN files + `index.json`
- `tools/pbn_to_lin.py` — PBN→LIN converter (validated against bridge-wrangler output)
- `tools/build_scenarios.py` — regenerates `scenarios/` from `bba-filtered/`
- `tests/` — unit tests (`npm test`, uses `node --test`)
- `docs/PLAN.md` — implementation plan
- `docs/UPLOAD-DISCOVERY.md` — how the BBO Deal archive upload works (reverse-engineered notes)

## Updating scenarios

```bash
python3 tools/build_scenarios.py [path-to-bba-filtered]
git add scenarios && git commit -m "Refresh scenarios" && git push
```

Users get the new scenario list automatically (the extension caches it for 1 hour).

## Status

Working end-to-end (verified 2026-06-03: 24 deals from 3 scenarios uploaded
into an auto-created `PBS-…` folder). Not yet on the Chrome Web Store.

Remaining before public release: second-account test, large-file (100+ board)
test, store listing assets, privacy policy, BBO ToS check.
