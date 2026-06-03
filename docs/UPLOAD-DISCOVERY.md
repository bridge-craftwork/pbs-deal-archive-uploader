# BBO Deal Archive Upload — Discovery Notes (2026-06-03)

Findings from a live session in the BBO v3 web app (`www.bridgebase.com/v3/`),
confirmed with a successful 2-board test upload.

## Where the Deal archive lives

- Right-side panel → **Account** tab → **Deal archive** sub-tab.
- Folder list and board list are rendered in the main frame (Ionic/Angular,
  some shadow DOM). Folder/board data is fetched by a hidden helper via
  `POST https://webutil.bridgebase.com/v2/ud_api.php` (cross-origin to www).

## The Import LIN flow

1. User selects a **folder** in the Deal archive panel (red "SELECT FOLDER").
2. Clicking **Import LIN file** opens a dialog containing a **same-origin
   iframe**: `https://www.bridgebase.com/tools/v2linuploader/v2linuploader_sess.php`
   with query params `cu` (username), `cp` (session token), `cf` (folder ref),
   `cspawn=y`, `v3b`, `v3v`. The v3 app fills these in when opening the dialog.
3. The iframe contains a plain HTML form:
   - `action`: same URL (params included), `method=post`, `enctype=multipart/form-data`
   - fields: `srcfile` (type=file), submit button
4. On submit, the response page reports e.g.
   `Source file(X.lin)-> 2 games were successfully uploaded into folder:Drury for username:adb42`

## Key implications for the extension

- **No token handling needed.** The iframe is same-origin with
  `www.bridgebase.com`, so a content script can: find the iframe, set
  `input[type=file].files` via `DataTransfer` with a generated File, dispatch
  `change`, click the submit button, then read the result text from
  `iframe.contentDocument`. Verified working end-to-end via this exact method.
- **Uploads append to the currently selected folder.** There is no name field;
  the uploaded file's name does not create a new archive entry. The extension
  must therefore drive folder selection (and probably folder creation, so each
  upload can land in a cleanly named folder like `1N_Smolen_24deals_rand`).
- The deal archive panel UI must be open with a folder selected before the
  Import dialog produces a usable iframe. The iframe URL carries
  `cu` (username), `cp` (session token), and **`cf` = the selected folder's
  numeric ID** (e.g. `cf=6176027`, NOT the folder name), plus `cspawn=y`,
  `v3b`, `v3v`. So the extension must select the target folder in the panel
  first; the app then bakes that folder's ID into the uploader iframe.
- Board labels inside the folder come from the LIN `ah|Board n|` field.
- Synthetic (JS) clicks do not work on the app's tab bar buttons; trusted
  clicks (real input events) do. Form elements inside the uploader iframe
  respond fine to synthetic interaction.

## Folder management (in `hand-folder-panel`)

- The panel has two headings: **SELECT FOLDER** (folder list) and
  **SELECT DEAL** (boards in the selected folder).
- The **SELECT FOLDER** heading has an **add.svg** icon. Clicking it creates a
  new folder literally named **"Untitled folder"** (server call to
  `webutil.bridgebase.com/v2/ud_api.php`).
- Each folder row has its own **edit.svg** (rename) and **delete.svg** icons.
  Clicking a row's edit icon opens an **inline text input** pre-filled with the
  current folder name; committing (Enter / blur) saves via `ud_api.php`.
- An empty "Untitled folder" appears to be auto-discarded if left unnamed/empty
  (it vanished from the list after an aborted rename), so the create→rename
  steps must run as a tight sequence.
- Recommended extension sequence: open Account → Deal archive → click add.svg →
  rename the new "Untitled folder" inline to `PBS-yymmdd-hh-mm-<scenarios>` →
  select that folder → open Import LIN → inject file into the iframe form →
  submit → read confirmation.

## Folder naming convention (per user request)

`PBS-yymmdd-hh-mm` followed by a scenario-derived suffix, e.g.
`PBS-260603-14-30-1N_Smolen` or `PBS-260603-14-30-5scenarios`. Keeps practice
sets sorted chronologically and easy to find in the archive.

## Open items

- `ud_api.php` request bodies (create/rename/list/delete) are not captured —
  the Claude browser tool redacts them because they include the session token.
  The extension's own content script will not be redacted; decide at build time
  between (a) UI automation of add/rename (robust, no token parsing) and
  (b) direct `ud_api.php` calls (fewer DOM steps). UI automation is the safer
  default; capture the API format only if automation proves flaky.
- Size limits of `srcfile` uploads unknown; test with a 100+ board file.
- Discovery left no stray folders (empty untitled folder auto-removed). The two
  test boards earlier added to "Drury" were deleted by the user.
