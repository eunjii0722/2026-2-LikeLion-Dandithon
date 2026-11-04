import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as data from "../lib/data.js";
import { getTrees as oldTrees } from "../components/tree/tempData.js";
import { getDiaryModel as oldDiary, getDiaryHref as oldHref } from "../components/diary/diaryData.js";
import { DIARY_DIALECT_WORDS } from "../lib/prompts/diary.js";

test("static trees preserve the A/B identity and placeholders", () => {
  assert.deepEqual(data.getTrees(), oldTrees().map(tree => ({ ...tree, currentWeek: 39, photo: "/images/demo/baby_apple_tree.jpg" })));
  assert.equal(data.getTree("tree-1").name, "홍이");
  assert.equal(data.getTree("tree-1").farm.region, "청송");
  for (const tree of data.getTrees()) {
    for (const key of ["id", "name", "variety", "farm", "photo", "startWeek", "harvestWeek", "currentWeek"]) {
      assert.ok(Object.hasOwn(tree, key));
    }
    assert.ok(tree.startWeek <= tree.currentWeek && tree.currentWeek <= tree.harvestWeek && tree.harvestWeek <= 53);
  }
});

test("diary IDs are unique and every tree, week, season and nested field is valid", () => {
  const trees = data.getTrees();
  assert.equal(new Set(trees.map(tree => tree.id)).size, trees.length);
  const diaries = trees.flatMap(tree => data.getDiaries(tree.id));
  assert.deepEqual(diaries.map(diary => diary.id), ["tree-1-w18", "tree-1-w21", "tree-1-w28", "tree-1-w35"]);
  assert.equal(new Set(diaries.map(diary => diary.id)).size, diaries.length);
  for (const diary of diaries) {
    assert.ok(data.getTree(diary.treeId));
    assert.equal(data.isDiary(diary), true);
    assert.ok(Object.hasOwn(data.SEASON_NAMES, diary.season));
    for (const key of ["growthStage", "confidence", "farmerConfirmed", "observedAt", "weather", "farmerNote"]) {
      assert.ok(Object.hasOwn(diary.evidence, key));
    }
    assert.match(diary.photo.url, /^\/images\/demo\//u);
  }
});

test("glossary matches existing prompt definitions and diary words", () => {
  const words = data.getWords();
  assert.deepEqual(Object.fromEntries(words.map(({ word, meaning }) => [word, meaning])), DIARY_DIALECT_WORDS);
  assert.equal(new Set(words.map(item => item.word)).size, words.length);
  for (const entry of words) {
    assert.deepEqual(Object.keys(entry).sort(), ["meaning", "region", "word"]);
    assert.equal(entry.region, "경상도");
  }
  for (const diary of data.getDiaries("tree-1")) {
    for (const entry of diary.dialectWords) assert.equal(DIARY_DIALECT_WORDS[entry.word], entry.meaning);
  }
});

test("weather is explicitly empty, with no invented observations", async () => {
  const raw = JSON.parse(await readFile(new URL("../data/weather.json", import.meta.url), "utf8"));
  assert.deepEqual(raw, []);
  assert.deepEqual(data.getWeather(), []);
});

test("missing trees/diaries return null or empty arrays", () => {
  for (const id of [undefined, null, "unknown", {}, "__proto__"]) {
    assert.equal(data.getTree(id), null);
    assert.deepEqual(data.getDiaries(id), []);
    assert.equal(data.getDiary(id, 18), null);
    assert.deepEqual(data.mergeDiaries(id), []);
    assert.deepEqual(data.getHomeDataForTree(id), { tree: null, diary: null });
  }
  assert.equal(data.getDiary("tree-1", 17), null);
  assert.equal(data.getDiary("tree-1", 18, "wrong-id"), null);
  assert.equal(data.getDiary("tree-1", 18).isSpecial, false);
});

test("returned JSON values cannot mutate common static data", () => {
  const tree = data.getTree("tree-1");
  tree.farm.region = "changed";
  const original = data.getDiaries("tree-1");
  data.getDiaries("tree-1")[0].evidence.weather = { tempMax: 999, tempMin: 0, rainMm: 0 };
  data.getWords()[0].meaning = "changed";
  assert.equal(data.getTree("tree-1").farm.region, "청송");
  assert.deepEqual(data.getDiaries("tree-1"), original);
  assert.equal(data.getWords()[0].meaning, DIARY_DIALECT_WORDS[data.getWords()[0].word]);
});

test("malformed generated diaries are rejected without hiding static diaries", () => {
  const diary = data.getDiary("tree-1", 18);
  for (const broken of [null, [], {}, { ...diary, week: 0 }, { ...diary, week: 54 },
    { ...diary, week: 1.5 }, { ...diary, season: "__proto__" }, { ...diary, dialectWords: null },
    { ...diary, photo: null }, { ...diary, evidence: {} },
    { ...diary, evidence: { ...diary.evidence, observedAt: "2026-02-30" } },
    { ...diary, evidence: { ...diary.evidence, weather: { tempMax: "22", tempMin: 8, rainMm: 0 } } }]) {
    assert.equal(data.isDiary(broken), false);
    assert.deepEqual(data.mergeDiaries("tree-1", [broken]), data.getDiaries("tree-1"));
  }
});

test("unknown observations may be null; missing required keys are not fabricated", () => {
  const diary = data.getDiary("tree-1", 18);
  diary.evidence = { growthStage: null, confidence: null, farmerConfirmed: null, observedAt: null, weather: null, farmerNote: null };
  assert.equal(data.isDiary(diary), true);
  delete diary.evidence.farmerConfirmed;
  assert.equal(data.isDiary(diary), false);
});

test("Home and Diary selectors preserve B status, navigation and special-diary contracts", () => {
  const seed = data.getDiaries("tree-1");
  const demoState = { version: 1, treeId: "tree-1", currentWeek: 39 };
  assert.deepEqual(data.getHomeDataForTree("tree-1", seed, demoState).tree, data.getTree("tree-1"));
  assert.equal(data.getHomeDataForTree("tree-1", seed, demoState).diary.id, "tree-1-w35");
  const weeks = [18, 21, 28, 35];
  for (const week of [1, 16, 17, ...weeks, 39, 41, 53]) {
    const actual = data.getDiaryModel({ treeId: "tree-1", generatedDiaries: seed, demoState }, week);
    assert.equal(actual.status, week > 39 ? "future" : weeks.includes(week) ? "ready" : "missing");
    if (actual.status === "ready") {
      assert.equal(actual.previousWeek, weeks[weeks.indexOf(week) - 1] ?? null);
      assert.equal(actual.nextWeek, weeks[weeks.indexOf(week) + 1] ?? null);
      assert.equal(actual.diary.id, `tree-1-w${week}`);
      assert.deepEqual(actual.related, []);
    }
  }
  // Keep the old special-news fixture as a regression case, not a fabricated live observation.
  const special = oldDiary({ treeId: "tree-1" }, 18, "tree-1-w18-special").diary;
  assert.equal(data.getDiaryHref(special), oldHref(special));
  const model = data.getDiaryModel({ treeId: "tree-1", generatedDiaries: [...seed, special] }, 18);
  assert.deepEqual(model.related.map(item => item.id), [special.id]);
  assert.equal(data.getDiaryModel({ treeId: "tree-1", generatedDiaries: [...seed, special] }, 18, special.id).diary.id, special.id);
  assert.equal(data.getDiaryModel().status, "no-tree");
  assert.equal(data.getDiaryHref(null), null);
});
