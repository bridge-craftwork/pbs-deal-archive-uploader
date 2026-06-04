import test from "node:test";
import assert from "node:assert/strict";
import {
  splitCounts,
  selectDeals,
  shuffle,
  restamp,
  rotateLin,
  rotationForBoard,
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

test("uploadName: 'PBS yy/mm/dd hh:mm <suffix> Rn Dnn'", () => {
  const d = new Date(2026, 5, 3, 14, 30); // 2026-06-03 14:30
  assert.equal(uploadName(["Smolen"], 12, 1, d), "PBS 26/06/03 14:30 Smolen R1 D12");
  assert.equal(uploadName(["a", "b", "c"], 24, 4, d), "PBS 26/06/03 14:30 S3 R4 D24");
  assert.equal(uploadName(["1N", "Drury"], 16, 2, d), "PBS 26/06/03 14:30 S2 R2 D16");
  const long = uploadName(["Gavin_Passed_Hand_Response_Structure"], 24, 4, d);
  assert.ok(long.length <= 40);
  assert.ok(long.endsWith(" R4 D24"));
});

const VOID_LINE =
  "qx|o1|md|3SK64HKJ865DAK2CK3,SQ85HAQ97DJ85CAT7,SHT32DQT7643CQ864|sv|n|rh||ah|Board 1|pg||";

test("rotateLin 180: S<->N, computed East lands in West, dealer follows", () => {
  const out = rotateLin(VOID_LINE, 2);
  const md = /md\|(\d)([^|]*)\|/.exec(out);
  assert.equal(md[1], "1"); // dealer N (3) -> S (1)
  const [s, w, n] = md[2].split(",");
  assert.equal(s, "SHT32DQT7643CQ864"); // old North (with spade void) now South
  assert.equal(n, "SK64HKJ865DAK2CK3"); // old South now North
  assert.equal(w, "SAJT9732H4D9CJ952"); // old East (computed from the other three)
  assert.ok(out.includes("|sv|n|")); // 180° keeps NS/EW vul
});

test("rotateLin 90: vul swaps NS<->EW, k=0 identity, 4x90 = identity", () => {
  const line =
    "qx|o1|md|1SA63HQJ92DAT2CA83,SKJ5HKT6DKQ7CQT74,ST82HA843D43CK952|sv|e|rh||ah|Board 1|pg||";
  assert.equal(rotateLin(line, 0), line);
  const r1 = rotateLin(line, 1);
  assert.ok(r1.includes("|sv|n|")); // EW -> NS
  // rotating four times by 90° returns the original
  let x = line;
  for (let i = 0; i < 4; i++) x = rotateLin(x, 1);
  assert.equal(x, line);
});

test("rotationForBoard patterns", () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => rotationForBoard(1, i)), [0, 0, 0, 0]);
  assert.deepEqual([0, 1, 2, 3].map((i) => rotationForBoard(2, i)), [0, 2, 0, 2]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => rotationForBoard(4, i)), [0, 1, 2, 3, 0]);
});

test("buildLin applies rotation per board", () => {
  const scenarios = [{ name: "A", lines: mkLines("A", 10) }];
  const { lines } = buildLin(scenarios, 4, "seq", 1, seeded(), 2);
  // source deals all have dealer 1 (South); boards 2 and 4 rotated 180 -> dealer 3 (North)
  const dealers = lines.map((l) => /md\|(\d)/.exec(l)[1]);
  assert.deepEqual(dealers, ["1", "3", "1", "3"]);
});
