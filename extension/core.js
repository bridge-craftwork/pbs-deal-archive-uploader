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

/**
 * Build the final mixed LIN content.
 * scenarios: [{ name, lines }] — lines are that scenario's full LIN lines.
 * Returns { lines, perScenario: {name: count} }.
 */
export function buildLin(scenarios, total, mode, start = 1, rng = Math.random) {
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
  return { lines: picked.map((l, i) => restamp(l, i + 1)), perScenario };
}

/**
 * Folder/file name: PBS-yymmdd-hh-mm-<suffix>, suffix derived from
 * scenario names (1 name: the name; 2: A+B; >2: "<n>-scenarios").
 */
export function uploadName(names, date = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  const stamp = `PBS-${String(date.getFullYear()).slice(2)}${p(date.getMonth() + 1)}${p(
    date.getDate()
  )}-${p(date.getHours())}-${p(date.getMinutes())}`;
  let suffix;
  if (names.length === 1) suffix = names[0];
  else if (names.length === 2) suffix = `${names[0]}+${names[1]}`;
  else suffix = `${names.length}-scenarios`;
  suffix = suffix.replace(/[^A-Za-z0-9_+-]/g, "_");
  const full = `${stamp}-${suffix}`;
  return full.length > 40 ? full.slice(0, 40) : full;
}
