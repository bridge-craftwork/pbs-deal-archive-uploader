# CLAUDE.md

Guidance for Claude when working in the pbs-deal-archive-uploader repo.

## What this is

A Chrome MV3 extension that lets BBO users build practice sets from the
Practice-Bidding-Scenarios collection and upload them to their BBO Deal
archive. **Working end-to-end as of 2026-06-03** (verified live: 24 deals from
3 scenarios mixed and uploaded into an auto-created folder).

Owner: David Bailey (GitHub ADavidBailey, BBO username adb42). Related repo:
`~/Practice-Bidding-Scenarios` (scenario sources; see its CLAUDE.md).

## Architecture (one paragraph)

`tools/build_scenarios.py` converts `Practice-Bidding-Scenarios/bba-filtered/*.pbn`
(curated deals) to unrotated per-scenario LIN files in `scenarios/` +
`index.json`, committed to this repo and fetched by the extension from
raw.githubusercontent.com. The side panel (extension/panel.js) lets the user
pick scenarios/count/mode; extension/core.js selects deals (random or
sequential), shuffles multi-scenario sets, renumbers boards
(`qx|o{n}`, `ah|Board {n}` only — dealer/vul preserved, scenarios depend on
who opens). The content script (extension/content.js) drives the BBO v3 web
app: opens Account → Deal archive, creates a folder, renames it
`PBS-yymmdd-hh-mm-<scenarios>`, selects it, opens Import LIN file, injects the
generated file into the same-origin uploader iframe, submits, reads the
confirmation. No tokens are handled; everything rides the user's session.

## Key technical facts (hard-won, don't rediscover)

- BBO v3 app: Angular/Ionic, mostly regular DOM (not shadow). Deal archive UI
  lives in `<hand-folder-panel>`; folder/deal names render in **`<p>` leaf
  elements** (a text search over div/span only will miss them).
- Folder management icons: heading add = `add.svg`; per-row `edit.svg`,
  `delete.svg`; in-edit row confirm = **`done.svg`** + `delete.svg`.
  Rename input is `input[type=text]`, prefilled "Untitled folder".
- Clicking add creates a folder literally named "Untitled folder" immediately;
  empty ones left unnamed are auto-discarded by BBO later, but can linger.
  Code counts untitled rows before add and targets the newest after.
- The Import LIN dialog embeds a **same-origin** iframe:
  `www.bridgebase.com/tools/v2linuploader/v2linuploader_sess.php?cu=<user>&cp=<session>&cf=<folderID>&cspawn=y…`
  `cf` is the **numeric ID of the folder selected in the panel** when the
  dialog opens — so folder selection must precede opening the dialog.
  Form: `multipart/form-data`, single field `srcfile`. Success text:
  `"N games were successfully uploaded into folder:<name> for username:<user>"`.
- Set the file with `new File(...)` + `DataTransfer` on the iframe's
  `input[type=file]`, dispatch `change`, click submit. Works with synthetic
  events. Set input values via the native value setter + `input` event
  (Angular). Folder list/board data loads via `webutil.bridgebase.com/v2/ud_api.php`
  (cross-origin; not used directly).
- Deal counts: see `scenarios/index.json` (5–500 per scenario, median ~394).
- LIN format details and the PBN→LIN mapping are in `tools/pbn_to_lin.py`
  (dealer digit 1=S 2=W 3=N 4=E; hands listed S,W,N, East omitted; sv o/n/e/b).
  **All four suit letters are always emitted, even for voids** — the BBO
  uploader silently rejects hands with a missing suit letter (observed
  2026-06-03: boards with voids vanished from the uploaded folder), even
  though bridge-wrangler omits letters for voids and the handviewer accepts
  either form. ~16% of all deals contain a void in a listed hand.
  **Verified 2026-06-03**: a void deal in bare-letter form (e.g.
  `...,SH1032DQ107643CQ864` for a spade void) uploads and appears in the
  folder; the omitted-letter form is silently dropped. The "N games uploaded"
  success message prints even when boards are dropped — never trust it; count
  the boards that actually land. The extension caches scenario LINs for 1 hour,
  so after a data rebuild users must click "Refresh scenario data" in the panel
  (clears index + lin: keys) or wait out the TTL — otherwise they re-test
  against stale data and the "fix" appears not to work.

## Development workflow

- No build step. Tests: `npm test` (node --test, pure-logic tests for core.js).
- After changing extension code, the user must: `git pull` →
  chrome://extensions → refresh the PBS card → **reload the BBO tab**
  (content scripts in open tabs are NOT updated by an extension refresh —
  forgetting the tab reload reproduces old bugs and wastes a debugging cycle).
- Multiple open BBO tabs confuse messaging; panel.js tries all matching tabs,
  but prefer telling the user to keep one BBO tab.
- Scenario refresh: `python3 tools/build_scenarios.py` then commit+push
  `scenarios/`; extension caches index/LINs in chrome.storage for 1 hour.

## Conventions

- Upload/folder naming: `PBS-yymmdd-hh-mm-<suffix>`; suffix = scenario name,
  `A+B` for two, `N-scenarios` for more; sanitized, capped at 40 chars
  (core.js `uploadName`).
- Never delete anything in the user's BBO account; ask the user to clean up.
- The user (84, very sharp, but not a Chrome-internals person) prefers concise
  step-by-step instructions for browser/Terminal actions, one thing at a time.

## Remaining roadmap

- Test from a second BBO account (nothing should be profile-specific).
- Large-file test (100+ boards) — uploader size limit unknown.
- Chrome Web Store (public listing): icon/screenshots/promo text, privacy
  policy URL, permission justifications; check BBO ToS for automated uploads.
- Open questions: per-user "avoid repeats" history; scenario descriptions in
  index.json.
