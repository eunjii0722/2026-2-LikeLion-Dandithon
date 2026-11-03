// 외부 Vision/Diary HTTP만 대역으로 바꾸고 공통 저장소와 실제 프런트 요청 제어를 검증합니다.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { getDiary, isDiary, mergeDiaries } from "../lib/data.js";
import * as storage from "../lib/storage.js";
import { createFarmerWorkflow, createDiaryRequest, photoToVisionPayload, saveDiary } from "../components/farmer/farmerWorkflow.js";

const photo = { name: "test.jpg", dataUrl: "data:image/jpeg;base64,/9j/", mimeType: "image/jpeg" };
const vision = { growth_stage: "판단 불가", confidence: "낮음", flowers_visible: null, fruit_visible: false,
  fruit_color: null, observations: ["관찰 근거 부족"], uncertain_points: ["나무가 가려짐"] };
const input = { treeId: "tree-1", week: 18, photoType: "orchard", observedAt: "2026-05-02", farmerNote: "  가상 농부 메모  ", farmerConfirmed: false };
const weatherResult = { weather: { tempMax: 20.5, tempMin: -1, rainMm: 0 } };
let values, writes, calls;
beforeEach(() => {
  values = new Map(); writes = []; calls = [];
  const target = new EventTarget();
  target.CustomEvent = CustomEvent;
  target.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); writes.push(key); },
  };
  globalThis.window = target;
  storage.setSelectedTreeId("tree-1");
  writes.length = 0;
});
after(() => { delete globalThis.window; });

function diaryFor(body) {
  return { ...getDiary("tree-1", 18), id: `${body.treeId}-w${body.week}`, treeId: body.treeId, week: body.week,
    title: "모델이 만든 제목", text: "모델이 만든 본문. 쪼매 고맙다.", dialectWords: [{ word: "쪼매", meaning: "조금" }],
    photo: { url: null, type: body.photoType }, evidence: { growthStage: body.vision.growth_stage, confidence: body.vision.confidence,
      observedAt: body.observedAt, weather: body.weather, farmerNote: body.farmerNote, farmerConfirmed: body.farmerConfirmed } };
}
const fetcher = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body, signal: init.signal, headers: init.headers });
  return Response.json(url === "/api/vision" ? vision : diaryFor(body));
};
function workflow(options = {}) {
  let state;
  const events = [];
  const actions = createFarmerWorkflow({ treeId: "tree-1", fetcher, ...options,
    onChange(next) { state = next; events.push(next); } });
  return { actions, events, state: () => state };
}
const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const letter = (id, over = {}) => ({ id, treeId: "tree-1", week: 18, text: id, usedInDiaryId: null, ...over });

test("Vision request strips only the data URL prefix and keeps MIME; no extra fields", async () => {
  const { actions, state } = workflow();
  await actions.analyze(photo);
  assert.deepEqual(calls[0].body, { imageBase64: "/9j/", mimeType: "image/jpeg" });
  assert.deepEqual(calls[0].headers, { "Content-Type": "application/json" });
  assert.deepEqual(state().vision, vision);
  assert.equal(state().vision.flowers_visible, null);
  assert.equal(state().vision.fruit_visible, false);
});

test("missing/invalid image and decoded size over 4MB never reach Vision", async () => {
  for (const value of [null, {}, { ...photo, mimeType: "image/png" }, { ...photo, dataUrl: "data:image/jpeg;base64,???=" },
    { ...photo, dataUrl: `data:image/jpeg;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64")}` }]) {
    assert.throws(() => photoToVisionPayload(value));
    const { actions, state } = workflow(); await actions.analyze(value);
    assert.ok(state().visionError); assert.equal(state().busy, null);
  }
  assert.equal(calls.length, 0);
  assert.doesNotThrow(() => photoToVisionPayload({ ...photo, dataUrl: `data:image/jpeg;base64,${Buffer.alloc(4 * 1024 * 1024).toString("base64")}` }));
});

test("Vision server failures including missing key are shown and allow retry", async () => {
  for (const status of [400, 413, 429, 500, 502, 503, 504]) {
    let fail = true;
    const { actions, state } = workflow({ fetcher: (...args) => fail ? Response.json({ error: "안전한 서버 오류" }, { status }) : fetcher(...args) });
    await actions.analyze(photo); assert.equal(state().visionError, "안전한 서버 오류"); assert.equal(state().vision, null);
    fail = false; await actions.analyze(photo); assert.deepEqual(state().vision, vision); assert.equal(state().visionError, "");
  }
});

test("invalid JSON, malformed Vision and network errors leave no successful analysis", async () => {
  for (const fake of [async () => new Response("<html>"), async () => Response.json({ growth_stage: "개화" }), async () => { throw new Error("private request details"); }]) {
    const { actions, state } = workflow({ fetcher: fake }); await actions.analyze(photo);
    assert.ok(state().visionError); assert.equal(state().vision, null); assert.ok(!state().visionError.includes("private"));
  }
});

test("duplicate analysis clicks produce one request", async () => {
  const wait = pending(); let count = 0;
  const { actions, state } = workflow({ fetcher: () => { count++; return wait.promise; } });
  const first = actions.analyze(photo); await actions.analyze(photo); assert.equal(count, 1);
  wait.resolve(Response.json(vision)); await first; assert.deepEqual(state().vision, vision);
});

test("photo/target change cancels analysis and rejects late response even if fetch ignores abort", async () => {
  const wait = pending(); let signal;
  const { actions, state } = workflow({ fetcher: (_, init) => { signal = init.signal; return wait.promise; } });
  const first = actions.analyze(photo); actions.invalidate(true);
  assert.equal(signal.aborted, true); wait.resolve(Response.json(vision)); await first;
  assert.equal(state().vision, null); assert.equal(state().busy, null);
});

test("a newer photo wins over a late previous analysis", async () => {
  const wait = pending(); let count = 0;
  const { actions, state } = workflow({ fetcher: () => ++count === 1 ? wait.promise : Response.json({ ...vision, observations: ["new"] }) });
  const first = actions.analyze(photo); actions.invalidate(true); await actions.analyze(photo);
  wait.resolve(Response.json(vision)); await first; assert.deepEqual(state().vision.observations, ["new"]);
});

test("weather loading blocks generation; partialWeather only passes weather:null", () => {
  assert.throws(() => createDiaryRequest(input, vision, null, []), /날씨 조회/u);
  assert.throws(() => createDiaryRequest(input, vision, {}, []));
  const result = createDiaryRequest(input, vision, { weather: null, partialWeather: { tempMax: 20, tempMin: 10, rainMm: null } }, []);
  assert.equal(result.payload.weather, null); assert.ok(!Object.hasOwn(result.payload, "partialWeather"));
  assert.deepEqual(createDiaryRequest(input, vision, weatherResult, []).payload.weather, weatherResult.weather);
});

test("only unused letters of the selected tree up to the selected week are sent as strings", () => {
  const result = createDiaryRequest(input, vision, weatherResult, [letter("past", { week: 16 }), letter("now"),
    letter("future", { week: 19 }), letter("foreign", { treeId: "tree-2" }), letter("used", { usedInDiaryId: "old" })]);
  assert.deepEqual(result.letterIds, ["past", "now"]); assert.deepEqual(result.payload.letters, ["past", "now"]);
  assert.equal(result.payload.farmerNote, input.farmerNote); assert.equal(result.payload.farmerConfirmed, false);
  assert.equal(typeof result.payload.week, "number"); assert.deepEqual(result.payload.vision, vision);
});

test("invalid week/date/confirmation/weather are rejected without invented replacements", () => {
  for (const over of [{ week: 0 }, { week: 54 }, { week: "18" }, { observedAt: "2026-02-30" }, { farmerConfirmed: "false" }, { photoType: "other" }]) {
    assert.throws(() => createDiaryRequest({ ...input, ...over }, vision, weatherResult, []));
  }
  for (const weather of [{ tempMax: 5, tempMin: 10, rainMm: 0 }, { tempMax: 20, tempMin: 10, rainMm: null }]) {
    assert.throws(() => createDiaryRequest(input, vision, { weather }, []));
  }
});

test("unknown low-confidence analysis still generates; model title/text/dialect and request evidence survive storage", async () => {
  const { actions, state } = workflow(); await actions.analyze(photo); await actions.generate(input, { weather: null });
  assert.equal(calls[1].url, "/api/diary"); assert.deepEqual(calls[1].body, { ...input, vision, weather: null, letters: [] });
  assert.equal(state().saveResult.saved, true); assert.equal(state().diary.title, "모델이 만든 제목");
  assert.equal(state().diary.text, "모델이 만든 본문. 쪼매 고맙다.");
  assert.deepEqual(state().diary.dialectWords, [{ word: "쪼매", meaning: "조금" }]);
  assert.equal(isDiary(state().diary), true); assert.equal(state().diary.photo.url, photo.dataUrl);
  assert.equal(mergeDiaries("tree-1", storage.getGeneratedDiaries()).find((d) => d.id === "tree-1-w18").title, state().diary.title);
});

test("letters are marked only after diary persistence, and unrelated records survive", async () => {
  values.set("letters", JSON.stringify([letter("included"), letter("future", { week: 19 }), letter("foreign", { treeId: "tree-2" })]));
  values.set("generatedDiaries", JSON.stringify([{ ...getDiary("tree-1", 18), id: "tree-2-w18", treeId: "tree-2" }]));
  const { actions } = workflow(); await actions.analyze(photo); await actions.generate(input, weatherResult);
  assert.ok(writes.indexOf("generatedDiaries") < writes.indexOf("letters"));
  assert.equal(storage.getLetters().find((l) => l.id === "included").usedInDiaryId, "tree-1-w18");
  for (const id of ["future", "foreign"]) assert.equal(storage.getLetters().find((l) => l.id === id).usedInDiaryId, null);
  assert.equal(storage.getGeneratedDiaries("tree-2").length, 1);
});

test("photo quota failure falls back once to a photo-free diary and then marks letters", () => {
  storage.addLetter(letter("included"));
  const original = window.localStorage.setItem;
  window.localStorage.setItem = (key, value) => { if (key === "generatedDiaries" && value.includes("data:image")) throw new Error("quota"); original(key, value); };
  const diary = { ...diaryFor({ ...input, vision, weather: null }), photo: { type: "orchard", url: photo.dataUrl } };
  const result = saveDiary(diary, ["included"]);
  assert.equal(result.saved, true); assert.equal(result.withoutPhoto, true); assert.equal(result.diary.photo.url, null);
  assert.equal(storage.getLetters()[0].usedInDiaryId, diary.id);
});

test("all storage attempts fail: keep preview, never show saved status or consume letters; retry needs no Gemini", async () => {
  storage.addLetter(letter("included")); const original = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error("quota"); };
  const { actions, state } = workflow(); await actions.analyze(photo); await actions.generate(input, weatherResult);
  assert.ok(state().diary); assert.equal(state().saveResult.saved, false);
  assert.equal(storage.getLetters()[0].usedInDiaryId, null); assert.equal(storage.getGeneratedDiaries().length, 0);
  window.localStorage.setItem = original; actions.persist();
  assert.equal(state().saveResult.saved, true); assert.equal(calls.length, 2); assert.equal(storage.getLetters()[0].usedInDiaryId, "tree-1-w18");
});

test("letter marking failure is separate from diary saving and can retry without overwriting diary", async () => {
  storage.addLetter(letter("included")); const original = window.localStorage.setItem;
  window.localStorage.setItem = (key, value) => { if (key === "letters") throw new Error("quota"); original(key, value); };
  const { actions, state } = workflow(); await actions.analyze(photo); await actions.generate(input, weatherResult);
  assert.equal(state().saveResult.saved, true); assert.deepEqual(state().saveResult.unmarked, ["included"]);
  const diaryWrites = writes.filter((k) => k === "generatedDiaries").length;
  window.localStorage.setItem = original; actions.persist(); assert.deepEqual(state().saveResult.unmarked, []);
  assert.equal(writes.filter((k) => k === "generatedDiaries").length, diaryWrites);
});

test("letter-only retry refuses to consume against a replaced same-ID diary", async () => {
  storage.addLetter(letter("included"));
  const { actions, state } = workflow({ store: { ...storage, markLetterUsed: () => false } });
  await actions.analyze(photo); await actions.generate(input, weatherResult);
  storage.addGeneratedDiary({ ...state().diary, title: "newer external result" }); actions.persist();
  assert.match(state().diaryError, /변경/u); assert.equal(storage.getLetters()[0].usedInDiaryId, null);
});

test("duplicate generation clicks make one diary request", async () => {
  const wait = pending(); let count = 0;
  const { actions, state } = workflow({ fetcher: (url, init) => url === "/api/vision" ? fetcher(url, init) : (count++, wait.promise) });
  await actions.analyze(photo); const first = actions.generate(input, weatherResult); await actions.generate(input, weatherResult);
  assert.equal(count, 1); wait.resolve(Response.json(diaryFor({ ...input, vision, weather: weatherResult.weather })));
  await first; assert.equal(state().saveResult.saved, true);
});

test("input changes discard a late generated diary before storage or letter marking", async () => {
  const wait = pending();
  const { actions, state } = workflow({ fetcher: (url, init) => url === "/api/vision" ? fetcher(url, init) : wait.promise });
  await actions.analyze(photo); const first = actions.generate(input, weatherResult); actions.invalidate();
  wait.resolve(Response.json(diaryFor({ ...input, vision, weather: weatherResult.weather }))); await first;
  assert.equal(state().diary, null); assert.deepEqual(storage.getGeneratedDiaries(), []); assert.deepEqual(state().vision, vision);
});

test("unmount cancels requests and late results produce no more state notifications", async () => {
  const wait = pending(); const { actions, events } = workflow({ fetcher: () => wait.promise });
  const first = actions.analyze(photo); actions.dispose(); const count = events.length;
  wait.resolve(Response.json(vision)); await first; assert.equal(events.length, count);
});

test("a changed selected tree prevents stale diary persistence even before cleanup", async () => {
  const wait = pending(); const { actions, state } = workflow({ fetcher: (url, init) => url === "/api/vision" ? fetcher(url, init) : wait.promise });
  await actions.analyze(photo); const first = actions.generate(input, weatherResult); storage.setSelectedTreeId(null);
  wait.resolve(Response.json(diaryFor({ ...input, vision, weather: weatherResult.weather }))); await first;
  assert.equal(state().diary, null); assert.equal(storage.getGeneratedDiaries().length, 0);
});

test("malformed or foreign diary responses are never persisted", async () => {
  for (const modify of [(d) => ({ ...d, treeId: "tree-2" }), (d) => ({ ...d, week: 19 }),
    (d) => ({ ...d, evidence: { ...d.evidence, farmerNote: "invented" } }), () => ({ title: "only title" })]) {
    const { actions, state } = workflow({ fetcher: (url, init) => url === "/api/vision" ? fetcher(url, init) : Response.json(modify(diaryFor(JSON.parse(init.body)))) });
    await actions.analyze(photo); await actions.generate(input, weatherResult);
    assert.ok(state().diaryError); assert.equal(state().diary, null); assert.equal(storage.getGeneratedDiaries().length, 0);
  }
});

test("diary failure preserves valid analysis and can retry without another Vision request", async () => {
  let fail = true;
  const { actions, state } = workflow({ fetcher: (url, init) => url === "/api/diary" && fail ? Response.json({ error: "일기 서비스 오류" }, { status: 502 }) : fetcher(url, init) });
  await actions.analyze(photo); await actions.generate(input, weatherResult); assert.equal(state().diaryError, "일기 서비스 오류");
  assert.deepEqual(state().vision, vision); fail = false; await actions.generate(input, weatherResult);
  assert.equal(state().saveResult.saved, true); assert.equal(calls.filter((c) => c.url === "/api/vision").length, 1);
});

test("client deadline exits loading even when a transport ignores cancellation", async () => {
  const { actions, state } = workflow({ timeoutMs: 5, fetcher: () => new Promise(() => {}) });
  await actions.analyze(photo); assert.equal(state().busy, null); assert.match(state().visionError, /시간이 초과/u);
});
