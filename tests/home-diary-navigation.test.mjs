import assert from "node:assert/strict";
import test from "node:test";
import { getDiaries, getDiary, getDiaryModel, getHomeDataForTree, seasonOfWeek } from "../lib/data.js";

const seed = getDiaries("tree-1");
const demoState = { version: 1, treeId: "tree-1", currentWeek: 39 };
const demo = { treeId: "tree-1", generatedDiaries: seed, demoState };
const generated = (week, extra = {}) => ({ ...getDiary("tree-1", 35), id: `tree-1-w${week}`, week, ...extra });

test("home current season stays autumn before and after a week 39 diary arrives", () => {
  const before = getHomeDataForTree("tree-1", seed, demoState);
  assert.equal(seasonOfWeek(before.tree.currentWeek), "autumn");
  assert.equal(before.diary.week, 35);
  assert.equal(before.diary.season, "summer");
  assert.equal(before.tree.harvestWeek - before.tree.currentWeek, 2);
  const after = getHomeDataForTree("tree-1", [...seed, generated(39, { season: "autumn" })], demoState);
  assert.equal(seasonOfWeek(after.tree.currentWeek), "autumn");
  assert.equal(after.diary.week, 39);
  assert.equal(getDiaryModel(demo, 35).status, "ready");
});

test("missing and future pages link to the latest available earlier regular diary", () => {
  for (const week of [39, 41]) {
    const model = getDiaryModel(demo, week);
    assert.equal(model.status, week === 39 ? "missing" : "future");
    assert.equal(model.previousDiary.week, 35);
  }
  const generatedDiaries = [...seed, generated(37), generated(38, { isSpecial: true }), generated(40)];
  assert.equal(getDiaryModel({ ...demo, generatedDiaries }, 39).previousDiary.week, 37);
  assert.equal(getDiaryModel({ ...demo, generatedDiaries }, 41).previousDiary.week, 40);
});

test("fallback never links to the same or later week; empty history and no-tree remain safe", () => {
  assert.equal(getDiaryModel(demo, 17).previousDiary, null);
  assert.equal(getDiaryModel(demo, 18, "missing-id").previousDiary, null);
  assert.equal(getDiaryModel(demo, 28, "missing-id").previousDiary.week, 21);
  assert.equal(getDiaryModel({}, 39).status, "no-tree");
  assert.equal(getDiaryModel(demo, NaN).previousDiary, undefined);
});

test("new regular diary restores detail and future fallback without removing older records", () => {
  const context = { treeId: "tree-1", generatedDiaries: [...seed, generated(39, { season: "autumn" })] };
  assert.equal(getDiaryModel(context, 39).status, "ready");
  assert.equal(getDiaryModel(context, 39).previousWeek, 35);
  assert.equal(getDiaryModel(context, 35).nextWeek, 39);
  assert.equal(getDiaryModel(context, 41).status, "future");
  assert.equal(getDiaryModel(context, 41).previousDiary.week, 39);
});
