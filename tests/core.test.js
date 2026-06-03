import test from "node:test";
import assert from "node:assert/strict";
import {
  splitCounts,
  selectDeals,
  shuffle,
  restamp,
  buildLin,
  uploadName,
} from "../extension/core.js";

// Deterministic rng for tests
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const mkLines = (name, n) =>
  Array.from(
    { length: n },
    (_, i) =>
      `qx|o${i + 1}|md|1S${name}AKQHAKQDAKQCAKQJ,SKJ5HKT6DKQ7CQT74,ST82HA843D43CK952|sv|o|rh||ah|Board ${i + 1}|pg||`
  );

test("splitCounts splits evenly with remainder to the front", () => {
  assert.deepEqual(splitCounts(10, 3), [4, 3, 3]);
  assert.deepEqual(splitCounts(9, 3), [3, 3, 3]);
  assert.deepEqual(splitCounts(2, 3), [1, 1, 0]);
  assert.deepEqual(splitCounts(5, 1), [5]);
});

test("selectDeals sequential takes start..start+count-1", () => {
  const lines = mkLines("X", 20);
  const got = selectDeals(lines, 3, "seq", 5);
  assert.deepEqual(got, lines.slice(4, 7));
});

test("selectDeals sequential validates range", () => {
  assert.throws(() => selectDeals(mkLines("X", 10), 5, "seq", 8));
  assert.throws(() => selectDeals(mkLines("X", 3), 5, "rand"));
});

test("selectDeals random: no duplicates, all from source", () => {
  const lines = mkLines("X", 50);
  const got = selectDeals(lines, 20, "rand", 1, seeded());
  assert.equal(new Set(got).size, 20);
  got.forEach((l) => assert.ok(lines.includes(l)));
});

test("shuffle keeps all elements", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle([...arr], seeded());
  assert.deepEqual([...out].sort((a, b) => a - b), arr);
});

test("restamp renumbers qx and Board, preserves md/sv", () => {
  const line =
    "qx|o7|md|3ST82HA843D43CK952,SQ974H75DJ9865CJ6,SA63HQJ92DAT2CA83|sv|e|rh||ah|Board 7|pg||";
  const got = restamp(line, 1);
  assert.ok(got.startsWith("qx|o1|md|3ST82"));
  assert.ok(got.includes("|sv|e|"));
  assert.ok(got.includes("ah|Board 1|"));
});

test("buildLin mixes scenarios and renumbers 1..N", () => {
  const scenarios = [
    { name: "A", lines: mkLines("A", 30) },
    { name: "B", lines: mkLines("B", 30) },
    { name: "C", lines: mkLines("C", 30) },
  ];
  const { lines, perScenario } = buildLin(scenarios, 10, "seq", 1, seeded());
  assert.equal(lines.length, 10);
  assert.deepEqual(perScenario, { A: 4, B: 3, C: 3 });
  lines.forEach((l, i) => {
    assert.ok(l.startsWith(`qx|o${i + 1}|`));
    assert.ok(l.includes(`ah|Board ${i + 1}|`));
  });
  // interleaved: not all A's first after shuffle (with this seed)
  const order = lines.map((l) => l.match(/md\|1S([ABC])/)[1]).join("");
  assert.notEqual(order, "AAAABBBCCC");
  // counts per scenario survive the shuffle
  assert.equal(order.split("").filter((c) => c === "A").length, 4);
});

test("buildLin single scenario keeps order (no shuffle), still renumbers", () => {
  const scenarios = [{ name: "A", lines: mkLines("A", 30) }];
  const { lines } = buildLin(scenarios, 5, "seq", 11);
  // boards 11..15 renumbered 1..5
  assert.ok(lines[0].startsWith("qx|o1|"));
  assert.equal(lines.length, 5);
});

test("uploadName formats PBS-yymmdd-hh-mm-suffix", () => {
  const d = new Date(2026, 5, 3, 14, 30); // 2026-06-03 14:30
  assert.equal(uploadName(["1N"], d), "PBS-260603-14-30-1N");
  assert.equal(uploadName(["1N", "Smolen"], d), "PBS-260603-14-30-1N+Smolen");
  assert.equal(uploadName(["a", "b", "c", "d"], d), "PBS-260603-14-30-4-scenarios");
  // sanitizes and caps at 40 chars
  const long = uploadName(["Gavin_Passed_Hand_Response_Structure"], d);
  assert.ok(long.length <= 40);
});
