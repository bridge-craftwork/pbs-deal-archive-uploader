// Content script: drives the BBO v3 web app to create a Deal archive folder
// and import a generated LIN file into it.
//
// Flow (see docs/UPLOAD-DISCOVERY.md):
//   Account tab -> Deal archive -> add folder ("Untitled folder") ->
//   inline-rename to folderName -> select folder -> Import LIN file ->
//   same-origin uploader iframe: set srcfile via DataTransfer, submit,
//   read confirmation text.

(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function progress(text) {
    try {
      chrome.runtime.sendMessage({ type: "pbs-progress", text });
    } catch (e) {
      /* panel may be closed */
    }
  }

  async function waitFor(fn, timeoutMs = 10000, stepMs = 200) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {
        /* keep polling */
      }
      await sleep(stepMs);
    }
    throw new Error("timed out waiting for: " + (fn.label || fn.toString().slice(0, 80)));
  }

  const visible = (e) => e && e.offsetWidth > 0 && e.offsetHeight > 0;

  function leavesByText(text, root = document) {
    return [...root.querySelectorAll("p,div,span,a,button,td,li,ion-label")].filter(
      (e) => e.children.length === 0 && e.textContent.trim() === text && visible(e)
    );
  }

  function leafByText(text, root = document) {
    return leavesByText(text, root)[0];
  }

  function folderPanel() {
    const p = document.querySelector("hand-folder-panel");
    return visible(p) ? p : null;
  }

  // ---------- step 1: make sure the Deal archive panel is open ----------
  async function openDealArchive() {
    if (folderPanel()) return;
    progress("Opening Account panel…");
    const acct = [...document.querySelectorAll("tab-bar-button")].find(
      (b) => b.textContent.trim() === "Account" && b.closest(".verticalTabBarClass")
    );
    if (acct) (acct.querySelector("div") || acct).click();
    await sleep(800);
    progress("Opening Deal archive…");
    const da = await waitFor(() => leafByText("Deal archive"), 8000);
    da.click();
    await waitFor(folderPanel, 10000);
    await sleep(500); // let the folder list populate
  }

  // ---------- step 2: create + rename a folder ----------
  async function createFolder(name) {
    const panel = folderPanel();
    progress("Creating folder…");
    const heading = [...panel.querySelectorAll(".heading")].find((h) =>
      /SELECT FOLDER/i.test(h.textContent)
    );
    if (!heading) throw new Error("Deal archive folder list not found.");
    const add = heading.querySelector('img[src*="add"]');
    if (!add) throw new Error("Add-folder button not found.");
    // How many "Untitled folder" rows already exist (from prior aborted runs)?
    const before = leavesByText("Untitled folder", panel).length;
    add.click();

    // Wait until a NEW untitled folder appears, then operate on the last one.
    const untitled = await waitFor(() => {
      const all = leavesByText("Untitled folder", folderPanel());
      return all.length > before ? all[all.length - 1] : null;
    }, 8000);

    progress(`Naming folder "${name}"…`);
    // find the row's edit icon
    let row = untitled;
    for (let i = 0; i < 6 && row; i++) {
      if (row.querySelector && row.querySelector('img[src*="edit"]')) break;
      row = row.parentElement;
    }
    const edit = row && row.querySelector('img[src*="edit"]');
    if (!edit) throw new Error("Rename (edit) icon not found on new folder.");
    edit.click();

    // The rename box is the visible text input inside the folder panel.
    // Match by the input's actual `type` property (BBO may omit the attribute),
    // and don't depend on its current value.
    const input = await waitFor(() => {
      const panelNow = folderPanel() || document;
      const ins = [...panelNow.querySelectorAll("input")].filter(
        (e) => visible(e) && (e.type === "text" || e.type === "")
      );
      // prefer one still holding the default name, else the last visible one
      return ins.find((e) => e.value === "Untitled folder") || ins[ins.length - 1];
    }, 6000);

    // set value the Angular-compatible way
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(150);

    // Commit: prefer the row's confirm (checkmark) control; fall back to Enter.
    let confirmRow = input;
    for (let i = 0; i < 6 && confirmRow; i++) {
      if (confirmRow.querySelector && confirmRow.querySelector('img[src*="check"], img[src*="confirm"], img[src*="done"], img[src*="ok"]')) break;
      confirmRow = confirmRow.parentElement;
    }
    const check = confirmRow && confirmRow.querySelector('img[src*="check"], img[src*="confirm"], img[src*="done"], img[src*="ok"]');
    if (check) {
      check.click();
    } else {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
    }

    // confirm the renamed folder appears
    await waitFor(() => leafByText(name, folderPanel()), 8000);
  }

  // ---------- step 3: select folder ----------
  async function selectFolder(name) {
    progress(`Selecting folder "${name}"…`);
    const rowLabel = await waitFor(() => leafByText(name, folderPanel()), 5000);
    rowLabel.click();
    await sleep(700);
  }

  // ---------- step 4: import via the uploader iframe ----------
  async function importLin(fileName, content) {
    progress("Opening Import LIN dialog…");
    const importBtn = await waitFor(
      () =>
        [...document.querySelectorAll("button")].find(
          (b) => /Import LIN file/i.test(b.textContent) && visible(b)
        ),
      8000
    );
    importBtn.click();

    const frame = await waitFor(() => {
      const fr = [...document.querySelectorAll("iframe")].find(
        (f) => f.src && f.src.includes("v2linuploader")
      );
      if (!fr) return null;
      try {
        const d = fr.contentDocument;
        return d && d.querySelector("input[type=file]") ? fr : null;
      } catch (e) {
        return null;
      }
    }, 10000);

    progress("Injecting LIN file…");
    const doc = frame.contentDocument;
    const fileInput = doc.querySelector("input[type=file]");
    const file = new File([content], fileName, { type: "text/plain" });
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(200);

    progress("Submitting…");
    const submit = doc.querySelector("input[type=submit], button[type=submit]");
    if (!submit) throw new Error("Import submit button not found in uploader.");
    submit.click();

    // wait for the confirmation text in the (re-loaded) iframe document
    const message = await waitFor(() => {
      const fr = [...document.querySelectorAll("iframe")].find(
        (f) => f.src && f.src.includes("v2linuploader")
      );
      if (!fr) return null;
      try {
        const txt = fr.contentDocument && fr.contentDocument.body
          ? fr.contentDocument.body.innerText
          : "";
        const m = txt.match(/(\d+ games? were successfully uploaded[^\n]*)/i);
        if (m) return m[1];
        if (/error|fail|invalid/i.test(txt)) throw new Error("BBO uploader reported: " + txt.slice(0, 200));
      } catch (e) {
        if (String(e.message || "").startsWith("BBO uploader")) throw e;
      }
      return null;
    }, 30000, 400);

    // close the dialog
    const close = [...document.querySelectorAll('img[src*="close"]')].filter(visible).pop();
    if (close) close.click();

    return message;
  }

  // ---------- message handler ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "pbs-upload") return;
    (async () => {
      try {
        await openDealArchive();
        await createFolder(msg.folderName);
        await selectFolder(msg.folderName);
        const message = await importLin(msg.fileName, msg.content);
        sendResponse({ ok: true, message });
      } catch (e) {
        sendResponse({ ok: false, message: String(e.message || e) });
      }
    })();
    return true; // keep the message channel open for async sendResponse
  });
})();
