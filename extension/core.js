// Core deal-selection / mixing logic for the PBS Deal Archive Uploader.
// Pure functions, no browser APIs — unit-tested with node:test.

/**
 * Split `total` as evenly as possible across `n` scenarios.
 * Remainder goes to the first scenarios. splitCounts(10,3) -> [4,3,3]
 */
export function splitCounts(total, n) {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Select `count` deals from a scenario's LIN lines.
 * mode "seq": boards start..start+count-1 (1-based `start`).
 * mode "rand": sample without replacement.
 */
export function selectDeals(lines, count, mode, start = 1, rng = Math.random) {
  if (count > lines.length) {
    throw new Error(`asked for ${count} deals but only ${lines.length} available`);
  }
  if (mode === "seq") {
    const s = Math.max(1, start);
    if (s - 1 + count > lines.length) {
      throw new Error(
        `sequential ${count} from board ${s} exceeds ${lines.length} available`
      );
    }
    return lines.slice(s - 1, s - 1 + count);
  }
  // random sample without replacement (partial Fisher–Yates)
  const idx = Array.from({ length: lines.length }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, count).sort((a, b) => a - b).map((i) => lines[i]);
}

/** In-place Fisher–Yates shuffle. */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Re-stamp a LIN line's board index: qx|o{n}| and ah|Board {n}|.
 * Dealer digit (md|) and vulnerability (sv|) are left untouched —
 * scenarios depend on who deals.
 */
export function restamp(line, n) {
  return line
    .replace(/qx\|o\d+\|/, `qx|o${n}|`)
    .replace(/ah\|Board \d+\|/, `ah|Board ${n}|`);
}

// ---------- rotation ----------

const RANKS = "AKQJT98765432";
const SEATS_CW = ["N", "E", "S", "W"]; // clockwise around the table
const DIGIT_TO_SEAT = { 1: "S", 2: "W", 3: "N", 4: "E" };
const SEAT_TO_DIGIT = { S: "1", W: "2", N: "3", E: "4" };

function parseHand(h) {
  const m = /^S([^HDC]*)H([^SDC]*)D([^SHC]*)C([^SHD]*)$/.exec(h);
  if (!m) throw new Error("bad LIN hand: " + h);
  return { S: m[1], H: m[2], D: m[3], C: m[4] };
}

const handStr = (o) => `S${o.S}H${o.H}D${o.D}C${o.C}`;

/**
 * Rotate a LIN deal by k seats clockwise (k = 0..3). Hands, dealer, and
 * vulnerability all rotate together, so the scenario hand keeps its
 * relationship to the dealer — only which player holds it changes.
 */
export function rotateLin(line, k) {
  k = ((k % 4) + 4) % 4;
  if (k === 0) return line;
  const m = /md\|(\d)([^|]*)\|/.exec(line);
  if (!m) throw new Error("no md in LIN line");
  const [sH, wH, nH] = m[2].split(",").map(parseHand);
  const east = {};
  for (const suit of "SHDC") {
    const used = new Set((sH[suit] + wH[suit] + nH[suit]).split(""));
    east[suit] = [...RANKS].filter((r) => !used.has(r)).join("");
  }
  const hands = { S: sH, W: wH, N: nH, E: east };
  const rotated = {};
  for (const seat of SEATS_CW) {
    const to = SEATS_CW[(SEATS_CW.indexOf(seat) + k) % 4];
    rotated[to] = hands[seat];
  }
  const oldDealer = DIGIT_TO_SEAT[m[1]];
  const newDealer = SEATS_CW[(SEATS_CW.indexOf(oldDealer) + k) % 4];
  const newMd =
    SEAT_TO_DIGIT[newDealer] + [rotated.S, rotated.W, rotated.N].map(handStr).join(",");
  let out = line.replace(/md\|\d[^|]*\|/, `md|${newMd}|`);
  if (k % 2 === 1) {
    out = out.replace(/sv\|([oneb])\|/, (_, v) =>
      `sv|${v === "n" ? "e" : v === "e" ? "n" : v}|`
    );
  }
  return out;
}

/** Per-board rotation amount for a rotation setting of 1, 2, or 4 players. */
export function rotationForBoard(rotation, boardIndex) {
  if (rotation === 4) return boardIndex % 4; // 90° steps: everyone gets a turn
  if (rotation === 2) return (boardIndex % 2) * 2; // alternate 180°
  return 0; // no rotation
}

/**
 * Build the final mixed LIN content.
 * scenarios: [{ name, lines }] — lines are that scenario's full LIN lines.
 * rotation: 1 (none), 2 (alternate 180°), 4 (cycle 90°).
 * Returns { lines, perScenario: {name: count} }.
 */
export function buildLin(scenarios, total, mode, start = 1, rng = Math.random, rotation = 1) {
  if (!scenarios.length) throw new Error("no scenarios selected");
  if (total < 1) throw new Error("deal count must be at least 1");
  const counts = splitCounts(total, scenarios.length);
  const perScenario = {};
  let picked = [];
  scenarios.forEach((s, i) => {
    perScenario[s.name] = counts[i];
    if (counts[i] > 0) picked = picked.concat(selectDeals(s.lines, counts[i], mode, start, rng));
  });
  if (scenarios.length > 1) shuffle(picked, rng);
  return {
    lines: picked.map((l, i) => restamp(rotateLin(l, rotationForBoard(rotation, i)), i + 1)),
    perScenario,
  };
}

/**
 * Folder name: "PBS yy/mm/dd hh:mm <Snn|ScenarioName> Rn Dnn"
 * - Snn for multiple scenarios (nn = how many); the scenario name for one
 * - Rn = rotation setting (1, 2, or 4)
 * - Dnn = number of deals
 */
export function uploadName(names, total, rotation, date = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  const stamp = `PBS ${String(date.getFullYear()).slice(2)}/${p(date.getMonth() + 1)}/${p(
    date.getDate()
  )} ${p(date.getHours())}:${p(date.getMinutes())}`;
  const tail = ` R${rotation} D${total}`;
  let suffix =
    names.length === 1 ? names[0].replace(/[^A-Za-z0-9_+-]/g, "_") : `S${names.length}`;
  let full = `${stamp} ${suffix}${tail}`;
  if (full.length > 40) {
    const avail = 40 - stamp.length - 1 - tail.length;
    suffix = suffix.slice(0, Math.max(3, avail));
    full = `${stamp} ${suffix}${tail}`;
  }
  return full;
}
