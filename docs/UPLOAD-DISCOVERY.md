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
  Import dialog produces a usable iframe (`cf` comes from the selection).
- Board labels inside the folder come from the LIN `ah|Board n|` field.
- Synthetic (JS) clicks do not work on the app's tab bar buttons; trusted
  clicks (real input events) do. Form elements inside the uploader iframe
  respond fine to synthetic interaction.
- Folder management (create/rename/delete) presumably goes through
  `ud_api.php`; not yet captured. Capture by watching network requests while
  creating a folder manually if the extension needs to create folders via API
  rather than via UI automation.

## Open items

- Capture the `ud_api.php` request body for folder create / list (needed only
  if we automate folder management directly rather than through the UI).
- Size limits of `srcfile` uploads unknown; test with a 100+ board file.
- Two test boards were appended to the user's "Drury" folder during discovery
  and should be deleted manually (last two "Board 1"/"Board 2" entries).
