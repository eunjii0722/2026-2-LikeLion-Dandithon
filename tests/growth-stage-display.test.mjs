import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { getDiaries, getDiary, getDiaryModel, getDiaryStage, getHomeDataForTree, getPlannedStage, getTree, getUserTree, isDiary, isStageAdjusted } from "../lib/data.js";
import * as storage from "../lib/storage.js";
import { installDemoHistory } from "../public/demo/initialize.js";
import { createFarmerWorkflow } from "../components/farmer/farmerWorkflow.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const records = JSON.parse(await read("../data/demo/records.json"));
const plan = JSON.parse(await read("../data/demo/plan.json"));
const history = JSON.parse(await read("../public/demo/history.json"));
const demoState = history["dandithon.demoState"];
const demoTree = getUserTree("tree-1", history.generatedDiaries, demoState);
const INTRO_PHOTO = "/images/demo/baby_apple_tree.jpg";
const liveDiary = (growthStage, week = 39) => ({ ...getDiary("tree-1", 35), id: `tree-1-w${week}`, week, season: "autumn",
  evidence: { ...getDiary("tree-1", 35).evidence, growthStage } });
function browser() {
  const values = new Map();
  const target = new EventTarget();
  target.CustomEvent = CustomEvent;
  target.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.window = target;
  return { target, values };
}
afterEach(() => { delete globalThis.window; });

test("published weeks display 개화·착과·비대·착색 while the AI's week 21 result stays 착색", () => {
  const diaries = getDiaries("tree-1");
  assert.deepEqual(diaries.map((diary) => [diary.week, getDiaryStage(diary, demoTree)]), [[18, "개화"], [21, "착과"], [28, "비대"], [35, "착색"]]);
  assert.deepEqual(diaries.map((diary) => [diary.week, diary.evidence.growthStage]), [[18, "개화"], [21, "착색"], [28, "비대"], [35, "착색"]]);
  assert.deepEqual(diaries.map((diary) => isStageAdjusted(diary, demoTree)), [false, true, false, false]);
  const source = records.find((record) => record.week === 21);
  assert.equal(source.diaryAttempts.find((attempt) => attempt.status === 200).response.evidence.growthStage, "착색");
  assert.equal(source.visionAttempts.find((attempt) => attempt.status === 200).response.growth_stage, "착색");
  assert.deepEqual(history.generatedDiaries, diaries, "the demo install carries the same labels");
});

test("the correction adds only a label: every dialect title, body and glossary stays as reviewed", async () => {
  const edits = JSON.parse(await read("../data/demo/editorial.json"));
  for (const diary of getDiaries("tree-1")) {
    const edit = edits[diary.id];
    assert.equal(diary.title, edit.title);
    assert.equal(diary.text, edit.text);
    assert.deepEqual(diary.dialectWords, edit.dialectWords);
  }
  assert.deepEqual(Object.keys(edits).filter((id) => Object.hasOwn(edits[id], "displayStage")), ["tree-1-w21"]);
  assert.equal(getDiary("tree-1", 21).title, "작은 열매에 비친 붉은빛");
});

test("수확 직전 is a period label for the 1–2 weeks before harvest, not a stored AI result", () => {
  const tree = getTree("tree-1");
  assert.deepEqual([14, 35, 38, 39, 40, 41, 42].map((week) => getPlannedStage(tree, week)),
    [null, null, null, "수확 직전", "수확 직전", null, null]);
  assert.equal(getPlannedStage(demoTree), "수확 직전");
  assert.equal(getPlannedStage(getUserTree("tree-1")), null, "a new user at growth week 14 is not close to harvest");
  assert.equal(getPlannedStage(null), null);
  assert.equal(isDiary({ ...getDiary("tree-1", 21), displayStage: "수확 직전" }), false, "never a publishable or stored stage");
  assert.equal(isDiary({ ...liveDiary("착색"), evidence: { ...liveDiary("착색").evidence, growthStage: "수확 직전" } }), false);
  assert.equal(demoTree.harvestWeek, 41);
});

test("a live week 39 result is displayed as 수확 직전 with every AI result preserved beside it", () => {
  for (const result of ["착색", "수확기", "비대", "판단 불가"]) {
    const diary = liveDiary(result);
    assert.equal(getDiaryStage(diary, demoTree), "수확 직전");
    assert.equal(diary.evidence.growthStage, result);
    assert.equal(isStageAdjusted(diary, demoTree), true);
  }
  assert.equal(getDiaryStage(liveDiary("판단 불가", 30), demoTree), null, "unknown stages elsewhere stay hidden");
  assert.equal(isStageAdjusted(liveDiary("판단 불가", 30), demoTree), false);
  assert.equal(getDiaryStage(liveDiary("수확기", 41), demoTree), "수확기", "a real harvest-week diary shows its own result");
});

test("the mocked live farmer flow stores the real photo and the unmodified AI result for week 39", async () => {
  const { target } = browser();
  installDemoHistory(history, target);
  const vision = { growth_stage: "착색", flowers_visible: false, fruit_visible: true, fruit_color: "일부 붉음", observations: [], confidence: "보통", uncertain_points: [] };
  let state;
  const dataUrl = "data:image/jpeg;base64,/9j/";
  const actions = createFarmerWorkflow({ treeId: "tree-1", onChange: (value) => { state = value; }, fetcher: async (url, init) => {
    const input = JSON.parse(init.body);
    if (url === "/api/vision") return Response.json(vision);
    return Response.json({ id: "tree-1-w39", treeId: "tree-1", week: 39, season: "autumn", title: "테스트", text: "테스트 응답", isSpecial: false, dialectWords: [],
      photo: { url: null, type: input.photoType }, evidence: { growthStage: vision.growth_stage, confidence: vision.confidence,
        farmerConfirmed: input.farmerConfirmed, observedAt: input.observedAt, weather: input.weather, farmerNote: input.farmerNote } });
  } });
  await actions.analyze({ dataUrl, mimeType: "image/jpeg" });
  await actions.generate({ treeId: "tree-1", week: 39, photoType: "orchard", observedAt: "2026-09-26", farmerNote: "", farmerConfirmed: false }, { weather: null });
  assert.equal(state.saveResult.saved, true);
  const snapshot = JSON.parse(storage.getDiaryStorageSnapshot());
  const { tree, diary } = getHomeDataForTree("tree-1", snapshot.generatedDiaries, snapshot.demoState);
  assert.equal(diary.week, 39);
  assert.equal(diary.photo.url, dataUrl, "the farmer's photo becomes the growth record, never the intro photo");
  assert.equal(diary.evidence.growthStage, "착색");
  assert.equal(diary.displayStage, undefined);
  assert.equal(getDiaryStage(diary, tree), "수확 직전");
  assert.equal(getDiaryModel(snapshot, 41).status, "future", "week 41 stays locked");
  actions.dispose();
});

test("week 39 has no seeded diary and week 41 stays locked for the demo user", () => {
  const context = { treeId: "tree-1", generatedDiaries: history.generatedDiaries, demoState };
  assert.equal(getDiaryModel(context, 39).status, "missing");
  assert.equal(getDiaryModel(context, 41).status, "future");
  assert.ok(!history.generatedDiaries.some((diary) => diary.week >= 39));
});

test("the intro photo exists, stays out of every growth record, and Home never falls back to it", async () => {
  assert.equal(getTree("tree-1").photo, INTRO_PHOTO);
  await access(new URL(`../public${INTRO_PHOTO}`, import.meta.url));
  for (const source of [await read("../data/diaries.json"), await read("../public/demo/history.json"), await read("../data/demo/records.json"), await read("../data/demo/plan.json")]) {
    assert.ok(!source.includes("baby_apple_tree"));
  }
  assert.deepEqual(getDiaries("tree-1").map((diary) => diary.photo.url), records.map((record) => record.photo.url), "demo photos are unchanged");
  const home = await read("../components/home/HomeView.js");
  assert.doesNotMatch(home, /url: tree\.photo/u);
  assert.match(home, /diary\?\.photo\?\.url \? diary\.photo : \{ url: null, type: "tree" \}/u, "the top photo is this week's record only");
  assert.doesNotMatch(home, /latestDiary/u, "an older week's photo must not repeat above its own diary card");
  assert.match(home, /\$\{currentWeek\}주차 사진이 아직 도착하지 않았어요\./u);
  assert.match(home, /이번 주 새로운 소식을 기다리고 있어요\./u);
  browser();
  storage.adoptTree("tree-1");
  const snapshot = JSON.parse(storage.getDiaryStorageSnapshot());
  assert.equal(getHomeDataForTree("tree-1", snapshot.generatedDiaries, snapshot.demoState).diary, null);
});

test("no-photo wording replaces the old placeholder and every screen reads the shared stage helpers", async () => {
  const sources = await Promise.all(["../components/home/HomeView.js", "../components/diary/DiaryClient.js", "../components/common/PhotoPlaceholder.js"].map(read));
  for (const source of sources) assert.doesNotMatch(source, /사진 준비 중/u);
  assert.match(sources[0], /아직 \$\{treeName\}의 사진이 도착하지 않았어요\./u);
  assert.match(sources[2], /아직 나무 사진이 올라오지 않았어요\./u);
  for (const file of ["../components/home/HomeView.js", "../components/timeline/TimelineView.js", "../components/diary/DiaryClient.js", "../components/chat/ChatView.js"]) {
    const source = await read(file);
    assert.match(source, /getDiaryStage\(/u, file);
    assert.doesNotMatch(source.replace(/isStageAdjusted[^\n]*/gu, ""), /stage[^\n]*=[^\n]*evidence\??\.growthStage/iu, file);
  }
  const diary = await read("../components/diary/DiaryClient.js");
  assert.match(diary, /AI 사진 판정 원본/u);
  assert.match(diary, /사람이 보정한 게시용 표시/u);
  assert.equal(plan.liveDemo.generateInAdvance, false);
});
