import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { DEMO_KEYS, installDemoHistory, validDemoHistory } from "../public/demo/initialize.js";
import { getDiaries, getDiary, getDiaryModel, getHomeDataForTree, getTree, isDiary } from "../lib/data.js";
import * as storage from "../lib/storage.js";
import { createDiaryRequest, createFarmerWorkflow, isVision } from "../components/farmer/farmerWorkflow.js";

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const records = await json("../data/demo/records.json");
const plan = await json("../data/demo/plan.json");
const history = await json("../public/demo/history.json");
const success = (attempts) => attempts.find((attempt) => attempt.status === 200)?.response;
function browser() {
  const values = new Map();
  const target = new EventTarget();
  target.CustomEvent = CustomEvent;
  target.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = target;
  return { target, values };
}
afterEach(() => { delete globalThis.window; });

test("four source photos are linked by hash to actual captured Vision responses", async () => {
  assert.deepEqual(records.map((record) => record.week), [18, 21, 28, 35]);
  for (const record of records) {
    const bytes = await readFile(new URL(`../public${record.photo.url}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), record.photo.sha256);
    assert.equal(bytes.length, record.photo.bytes);
    assert.ok(bytes.length <= 4 * 1024 * 1024);
    const vision = success(record.visionAttempts);
    assert.ok(isVision(vision));
    assert.deepEqual(Object.keys(vision).sort(), ["growth_stage", "flowers_visible", "fruit_visible", "fruit_color", "observations", "confidence", "uncertain_points"].sort());
    assert.deepEqual(record.diaryRequest.vision, vision);
    assert.equal(record.photo.scope, "orchard");
    assert.ok(record.visionAttempts.every((attempt) => Number.isFinite(Date.parse(attempt.calledAt))));
  }
  assert.equal(records[1].expectedStage, "착과");
  assert.equal(success(records[1].visionAttempts).growth_stage, "착색", "keep the actual disagreement");
});

test("static diaries preserve API output exactly except the linked photo URL", () => {
  const diaries = getDiaries("tree-1");
  assert.equal(diaries.length, 4);
  for (const record of records) {
    const original = success(record.diaryAttempts);
    assert.ok(isDiary(original));
    const diary = diaries.find((item) => item.id === original.id);
    assert.deepEqual(diary, { ...original, photo: { ...original.photo, url: record.photo.url } });
    assert.equal(diary.evidence.growthStage, success(record.visionAttempts).growth_stage);
    assert.equal(diary.evidence.observedAt, record.observedAt);
    assert.equal(diary.season, record.week <= 21 ? "spring" : "summer");
  }
});

test("ASOS station/date provenance is retained and partial rainfall is never invented", () => {
  for (const record of records) {
    const result = success(record.weatherAttempts);
    assert.equal(result.date, record.observedAt);
    assert.deepEqual(result.source, { provider: "기상청", network: "ASOS", stationId: "276", stationName: "청송군" });
    assert.deepEqual(record.diaryRequest.weather, result.weather);
    assert.deepEqual(getDiary("tree-1", record.week).evidence.weather, result.weather);
    if (result.partialWeather) {
      assert.equal(result.reason, "rain_missing");
      assert.equal(result.partialWeather.rainMm, null);
      assert.equal(result.weather, null);
    }
  }
  assert.deepEqual(records.map((record) => success(record.weatherAttempts).weather), [null,
    { tempMax: 20.4, tempMin: 12.2, rainMm: 0 }, null, { tempMax: 30.4, tempMin: 23, rainMm: 28.5 }]);
});

test("all seven historical letters are consumed; no week 39 letter is seeded", () => {
  const unused = structuredClone(plan.letters);
  for (const record of records) {
    const included = unused.filter((letter) => letter.usedInDiaryId === null && letter.week <= record.week);
    assert.deepEqual(record.letterIds, included.map((letter) => letter.id));
    assert.deepEqual(record.diaryRequest.letters, included.map((letter) => letter.text));
    for (const letter of included) {
      assert.ok(letter.createdAt.slice(0, 10) <= record.observedAt);
      letter.usedInDiaryId = `tree-1-w${record.week}`;
    }
  }
  assert.deepEqual(history.letters, unused);
  assert.deepEqual(unused.filter((letter) => letter.usedInDiaryId === null).map((letter) => letter.week), []);
});

test("saved-word history references actual words in the generated diary text", () => {
  assert.equal(history.savedWords.length, 3);
  for (const word of history.savedWords) {
    const diary = getDiary("tree-1", word.week);
    assert.ok(diary.text.includes(word.word));
    assert.ok(diary.dialectWords.some((item) => item.word === word.word && item.meaning === word.meaning));
  }
});

test("autumn photo exists but no week 39 diary is seeded; harvest remains future", async () => {
  const bytes = await readFile(new URL("../public/images/demo/autumn-demo.jpg", import.meta.url));
  assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255]);
  assert.equal(plan.liveDemo.generateInAdvance, false);
  assert.equal(getTree("tree-1").currentWeek, 39);
  assert.equal(getTree("tree-1").harvestWeek, 41);
  assert.equal(getDiaryModel({ treeId: "tree-1" }, 39).status, "missing");
  assert.equal(getDiaryModel({ treeId: "tree-1" }, 41).status, "future");
  assert.deepEqual(history.generatedDiaries, []);
});

test("explicit initialization writes only agreed keys, notifies once, and common getters read everything", () => {
  const { target, values } = browser();
  let events = 0;
  const off = storage.subscribeToStorage(() => events++);
  assert.ok(validDemoHistory(history));
  assert.equal(installDemoHistory(history, target).ok, true);
  assert.deepEqual([...values.keys()].sort(), [...DEMO_KEYS].sort());
  assert.equal(events, 1);
  assert.equal(storage.getSelectedTreeId(), "tree-1");
  assert.deepEqual(storage.getLetters("tree-1"), history.letters);
  assert.deepEqual(storage.getSavedWords(), history.savedWords);
  assert.deepEqual(storage.getGeneratedDiaries(), []);
  assert.equal(storage.getAllDiaries("tree-1").length, 4);
  assert.deepEqual(storage.getLetters("tree-2"), []);
  assert.equal(getHomeDataForTree("tree-1", storage.getGeneratedDiaries()).diary.week, 35);
  assert.equal(storage.getLetters().length, 7);
  assert.ok(storage.getLetters().every(letter => letter.usedInDiaryId !== null));
  off();
});

test("reinitialization never overwrites previous letters, words, or generated results", () => {
  const { target, values } = browser();
  installDemoHistory(history, target);
  storage.addLetter({ treeId: "tree-1", week: 39, text: "실제 새 편지" });
  const before = [...values];
  assert.equal(installDemoHistory(history, target).ok, false);
  assert.deepEqual([...values], before);
});

test("even a single empty or malformed existing key blocks initialization without writes", () => {
  for (const key of DEMO_KEYS) for (const raw of ["null", "[]", "{broken", '"tree-1"']) {
    const { target, values } = browser();
    values.set(key, raw);
    assert.equal(installDemoHistory(history, target).ok, false);
    assert.deepEqual([...values], [[key, raw]]);
  }
});

test("invalid seed contracts are rejected before any write", () => {
  const invalid = [null, {}, { ...history, extraKey: [] }, { ...history, selectedTreeId: "tree-2" },
    { ...history, generatedDiaries: [getDiary("tree-1", 18)] },
    { ...history, letters: history.letters.map((letter) => ({ ...letter, usedInDiaryId: null })) },
    { ...history, savedWords: [{ word: "x", meaning: "y", week: 39 }] }];
  for (const seed of invalid) {
    const { target, values } = browser();
    assert.equal(installDemoHistory(seed, target).ok, false);
    assert.equal(values.size, 0);
  }
});

test("quota failures at each write roll back only this attempt and retain unrelated keys", () => {
  for (let failAt = 0; failAt < DEMO_KEYS.length; failAt++) {
    const { target, values } = browser();
    values.set("unrelated", "preserve");
    let writes = 0;
    target.localStorage.setItem = (key, value) => { if (writes++ === failAt) throw new Error("quota"); values.set(key, value); };
    assert.equal(installDemoHistory(history, target).ok, false);
    assert.deepEqual([...values], [["unrelated", "preserve"]]);
  }
});

test("storage access denial and failed rollback return explicit failure", () => {
  const { target, values } = browser();
  target.localStorage.setItem = (key, value) => { if (key === "savedWords") throw new Error("quota"); values.set(key, value); };
  target.localStorage.removeItem = () => { throw new Error("blocked"); };
  const result = installDemoHistory(history, target);
  assert.equal(result.ok, false);
  assert.match(result.reason, /복구/u);
  Object.defineProperty(target, "localStorage", { get() { throw new Error("denied"); } });
  assert.equal(installDemoHistory(history, target).ok, false);
});

test("concurrent data is retained and silent write failures are detected", () => {
  const { target, values } = browser();
  target.localStorage.setItem = (key, value) => {
    values.set(key, value);
    if (key === "letters") values.set("savedWords", "other-tab-data");
  };
  assert.equal(installDemoHistory(history, target).ok, false);
  assert.deepEqual([...values], [["savedWords", "other-tab-data"]]);
  values.clear();
  target.localStorage.setItem = () => {};
  assert.equal(installDemoHistory(history, target).ok, false);
  assert.equal(values.size, 0);
});

test("mocked live week 39 workflow generates without letters, preserving all historical replies", async () => {
  const { target } = browser();
  installDemoHistory(history, target);
  const vision = { growth_stage: "판단 불가", flowers_visible: null, fruit_visible: null, fruit_color: null,
    observations: [], confidence: "낮음", uncertain_points: ["격리된 테스트용 응답"] };
  let state;
  const requests = [];
  const actions = createFarmerWorkflow({ treeId: "tree-1", onChange: (value) => { state = value; },
    fetcher: async (url, init) => {
      const input = JSON.parse(init.body);
      requests.push({ url, input });
      if (url === "/api/vision") return Response.json(vision);
      assert.deepEqual(storage.getLetters(), history.letters);
      assert.equal(storage.getGeneratedDiaries().length, 0);
      return Response.json({ ...getDiary("tree-1", 18), id: "tree-1-w39", week: 39, season: "autumn",
        title: "격리된 테스트 일기", text: "테스트 응답이며 실제 Gemini 기록이 아닙니다.", dialectWords: [],
        photo: { url: null, type: input.photoType }, evidence: { growthStage: vision.growth_stage, confidence: vision.confidence,
          farmerConfirmed: input.farmerConfirmed, observedAt: input.observedAt, weather: input.weather, farmerNote: input.farmerNote } });
    } });
  await actions.analyze({ dataUrl: "data:image/jpeg;base64,/9j/", mimeType: "image/jpeg" });
  const input = { treeId: "tree-1", week: 39, photoType: "orchard", observedAt: "2026-09-26", farmerNote: "", farmerConfirmed: false };
  const weather = { weather: null, partialWeather: { tempMax: 20, tempMin: 10, rainMm: null } };
  assert.deepEqual(createDiaryRequest(input, vision, weather, storage.getLetters()).letterIds, []);
  await actions.generate(input, weather);
  assert.equal(state.saveResult.saved, true);
  assert.deepEqual(requests[1].input.letters, []);
  assert.equal(requests[1].input.weather, null);
  assert.deepEqual(storage.getLetters(), history.letters);
  const all = storage.getAllDiaries("tree-1");
  assert.deepEqual(all.map((diary) => diary.week), [18, 21, 28, 35, 39]);
  assert.equal(new Set(all.map((diary) => diary.id)).size, 5);
  assert.equal(getHomeDataForTree("tree-1", storage.getGeneratedDiaries()).diary.week, 39);
  assert.equal(getDiaryModel({ treeId: "tree-1", generatedDiaries: storage.getGeneratedDiaries() }, 39).previousWeek, 35);
  assert.equal(getDiaryModel({ treeId: "tree-1", generatedDiaries: storage.getGeneratedDiaries() }, 41).status, "future");
  actions.dispose();
});
