# PBS Deal Archive Uploader

A Chrome extension that lets BBO users build practice sets from curated bidding scenarios and upload them to their BBO Deal archive.

Pick one or more scenarios, choose how many deals you want and whether they're selected randomly or sequentially, and click Upload. The extension fetches scenario PBN files from a hosted index, converts the selected deals to LIN format (shuffling deals from multiple scenarios together), and uploads the result to your Deal archive using your existing BBO login.

Scenario deals come from the curated [Practice-Bidding-Scenarios](https://github.com/ADavidBailey/Practice-Bidding-Scenarios) collection (bba-filtered), pre-converted to LIN at build time and served from this repo.

See [docs/PLAN.md](docs/PLAN.md) for the implementation plan.

## Status

Planning. Build order: PBN parser + LIN writer → scenario hosting → BBO upload discovery → extension UI → upload wiring → Chrome Web Store submission.

## Layout (planned)

- `extension/` — MV3 extension (manifest, side panel UI, core JS)
- `scenarios/` — published scenario PBNs + index.json (served via GitHub Pages)
- `tools/` — build script that regenerates index.json from source PBNs
- `docs/` — plan and help page
