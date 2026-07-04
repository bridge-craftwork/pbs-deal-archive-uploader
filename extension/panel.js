import { buildLin, uploadName } from "./core.js";

const BASE =
  "https://raw.githubusercontent.com/bridge-craftwork/pbs-deal-archive-uploader/main/scenarios/";
const INDEX_TTL_MS = 60 * 60 * 1000; // 1 hour

const $ = (id) => document.getElementById(id);
const listEl = $("list"), statusEl = $("status");
let index = []; // [{name, file, dealCount}]

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

// ---------- scenario index ----------
async function loadIndex() {
  const cached = await chrome.storage.local.get(["index", "indexAt"]);
  if (cached.index && Date.now() - (cached.indexAt || 0) < INDEX_TTL_MS) {
    return cached.index;
  }
  const res = await fetch(BASE + "index.json");
  if (!res.ok) {
    if (cached.index) return cached.index; // stale cache better than nothing
    throw new Error(`failed to fetch scenario index (${res.status})`);
  }
  const idx = await res.json();
  await chrome.storage.local.set({ index: idx, indexAt: Date.now() });
  return idx;
}

async function fetchScenarioLines(entry) {
  const key = "lin:" + entry.file;
  const cached = await chrome.storage.local.get([key, key + ":at"]);
  if (cached[key] && Date.now() - (cached[key + ":at"] || 0) < INDEX_TTL_MS) {
    return cached[key];
  }
  const res = await fetch(BASE + entry.file);
  if (!res.ok) throw new Error(`failed to fetch ${entry.file} (${res.status})`);
  const lines = (await res.text()).trim().split("\n");
  try {
    await chrome.storage.local.set({ [key]: lines, [key + ":at"]: Date.now() });
  } catch (e) {
    // storage quota — fine, just don't cache
  }
  return lines;
}

// ---------- UI ----------
function renderList() {
  const filter = $("search").value.trim().toLowerCase();
  listEl.textContent = "";
  const addRow = (s) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = s.name;
    cb.checked = selected.has(s.name);
    cb.addEventListener("change", () => {
      cb.checked ? selected.add(s.name) : selected.delete(s.name);
      updateSummary();
      renderList(); // regroup: selected scenarios stay pinned at the top
    });
    const span = document.createElement("span");
    span.textContent = s.name.replace(/_/g, " ");
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = s.dealCount;
    label.append(cb, span, count);
    listEl.append(label);
  };
  // selected scenarios first (always visible, regardless of filter)
  const sel = index.filter((s) => selected.has(s.name));
  const rest = index.filter(
    (s) => !selected.has(s.name) && (!filter || s.name.toLowerCase().includes(filter))
  );
  sel.forEach(addRow);
  if (sel.length && rest.length) {
    const hr = document.createElement("div");
    hr.style.cssText = "border-top:1px solid #ccc; margin:4px 0;";
    listEl.append(hr);
  }
  rest.forEach(addRow);
}

const selected = new Set();

function updateSummary() {
  const names = [...selected];
  $("selectedSummary").textContent = names.length
    ? `Selected (${names.length}): ${names.join(", ")}`
    : "";
  chrome.storage.local.set({ lastSelected: names });
}

async function restoreSettings() {
  const s = await chrome.storage.local.get([
    "lastSelected", "lastTotal", "lastMode", "lastStart", "lastRotation",
  ]);
  (s.lastSelected || []).forEach((n) => selected.add(n));
  if (s.lastTotal) $("total").value = s.lastTotal;
  if (s.lastStart) $("start").value = s.lastStart;
  if (s.lastMode === "seq") {
    document.querySelector('input[name=mode][value=seq]').checked = true;
    $("start").disabled = false;
  }
  if (s.lastRotation) {
    const r = document.querySelector(`input[name=rot][value="${s.lastRotation}"]`);
    if (r) r.checked = true;
  }
}

function currentConfig() {
  const names = [...selected];
  if (!names.length) throw new Error("Select at least one scenario.");
  const total = parseInt($("total").value, 10);
  if (!(total >= 1)) throw new Error("Total deals must be at least 1.");
  const mode = document.querySelector("input[name=mode]:checked").value;
  const start = parseInt($("start").value, 10) || 1;
  const rotation = parseInt(document.querySelector("input[name=rot]:checked").value, 10);
  chrome.storage.local.set({
    lastTotal: total, lastMode: mode, lastStart: start, lastRotation: rotation,
  });
  return { names, total, mode, start, rotation };
}

async function buildContent() {
  const { names, total, mode, start, rotation } = currentConfig();
  setStatus("Fetching scenario deals…");
  const scenarios = [];
  for (const name of names) {
    const entry = index.find((s) => s.name === name);
    if (!entry) throw new Error(`scenario ${name} not in index`);
    scenarios.push({ name, lines: await fetchScenarioLines(entry) });
  }
  const { lines, perScenario } = buildLin(scenarios, total, mode, start, Math.random, rotation);
  const custom = $("customName").value.trim();
  const name = custom
    ? `${custom} R${rotation} D${total}`
    : uploadName(names, total, rotation);
  const summary = Object.entries(perScenario)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return { name, content: lines.join("\n") + "\n", summary, total };
}

// folder names contain "/", ":" and spaces — make a filesystem-safe filename
const safeFileName = (name) => name.replace(/[/:]/g, "-").replace(/ /g, "_");

// ---------- actions ----------
$("download").addEventListener("click", async () => {
  try {
    const { name, content, summary } = await buildContent();
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFileName(name) + ".lin";
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${name}.lin\n(${summary})`, "ok");
  } catch (e) {
    setStatus(String(e.message || e), "err");
  }
});

$("upload").addEventListener("click", async () => {
  const btn = $("upload");
  btn.disabled = true;
  try {
    const { name, content, summary, total } = await buildContent();
    setStatus(`Looking for a logged-in BBO tab…`);
    const tabs = await chrome.tabs.query({ url: "https://www.bridgebase.com/v3/*" });
    if (!tabs.length) {
      throw new Error(
        "No BBO tab found. Open https://www.bridgebase.com/v3/ and log in, then try again."
      );
    }
    // Prefer the active/most recently used tab; try each until one has the
    // content script loaded (tabs opened before install won't have it).
    tabs.sort((a, b) => (b.active - a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
    // keep a copy of exactly what we upload, for diagnosing rejects
    await chrome.storage.local.set({ lastUploadName: name, lastUploadContent: content });
    setStatus(`Uploading ${total} deals as "${name}"…`);
    let result, lastErr;
    for (const tab of tabs) {
      try {
        result = await chrome.tabs.sendMessage(tab.id, {
          type: "pbs-upload",
          folderName: name,
          fileName: safeFileName(name) + ".lin",
          content,
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    if (result && result.ok) {
      setStatus(`Done! Folder "${name}" created in your Deal archive.\n(${summary})\n${result.message || ""}`, "ok");
    } else {
      throw new Error((result && result.message) || "Upload failed (no response).");
    }
  } catch (e) {
    let msg = String(e.message || e);
    if (/Receiving end does not exist/i.test(msg)) {
      msg = "BBO tab found but the extension isn't loaded in it — reload the BBO tab and try again.";
    }
    setStatus(msg, "err");
  } finally {
    btn.disabled = false;
  }
});

// progress messages from the content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "pbs-progress") setStatus(msg.text);
});

$("refresh").addEventListener("click", async (ev) => {
  ev.preventDefault();
  setStatus("Clearing cached scenario data…");
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k === "index" || k === "indexAt" || k.startsWith("lin:"));
  await chrome.storage.local.remove(keys);
  index = await loadIndex();
  renderList();
  setStatus("Scenario data refreshed.", "ok");
});

$("downloadLast").addEventListener("click", async (ev) => {
  ev.preventDefault();
  const s = await chrome.storage.local.get(["lastUploadName", "lastUploadContent"]);
  if (!s.lastUploadContent) {
    setStatus("No previous upload stored.", "err");
    return;
  }
  const url = URL.createObjectURL(new Blob([s.lastUploadContent], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(s.lastUploadName || "last-upload") + ".lin";
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded ${s.lastUploadName}.lin (exact copy of last upload).`, "ok");
});

$("search").addEventListener("input", renderList);
document.querySelectorAll("input[name=mode]").forEach((r) =>
  r.addEventListener("change", () => {
    $("start").disabled = document.querySelector("input[name=mode]:checked").value !== "seq";
  })
);

// ---------- init ----------
(async function init() {
  try {
    await restoreSettings();
    index = await loadIndex();
    renderList();
    updateSummary();
    setStatus("Idle.");
  } catch (e) {
    listEl.textContent = "Could not load scenario list.";
    setStatus(String(e.message || e), "err");
  }
})();
