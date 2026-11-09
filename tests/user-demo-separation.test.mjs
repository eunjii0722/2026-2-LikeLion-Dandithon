import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { getAdoptionWeeks, getDiaries, getDiaryModel, getHomeDataForTree, isDemoDiary } from "../lib/data.js";
import * as storage from "../lib/storage.js";
import { installDemoHistory, validDemoHistory } from "../public/demo/initialize.js";
import { toChatDiaries, requestChat, sendChatQuestion, getActiveChatRequest, chatDelayMessage, CHAT_TIMEOUT_MS } from "../components/chat/chatApi.js";
const history = JSON.parse(await readFile(new URL("../public/demo/history.json", import.meta.url), "utf8"));
const realFetch = globalThis.fetch;
test("demo records remain distinguishable after storage and a regenerated week becomes an AI record", () => {
  const original = history.generatedDiaries[0];
  const state = history["dandithon.demoState"];
  assert.equal(isDemoDiary(original, state), true);
  assert.equal(isDemoDiary({ ...original, text: `${original.text} 새로 생성` }, state), false);
  assert.equal(isDemoDiary(original, null), false);
  const sent = toChatDiaries([original, { ...original, id: "tree-1-w39", week: 39 }], 39, new Set([original.id]));
  assert.deepEqual(sent.map((diary) => diary.recordKind), ["demo", "generated"]);
});
function browser(values = new Map()) {
  const target = new EventTarget();
  target.CustomEvent = CustomEvent;
  target.localStorage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.window = target;
  return { target, values };
}
afterEach(() => { delete globalThis.window; globalThis.fetch = realFetch; });

test("new adoption is 0 weeks together at growth week 14 with no demo diary, letter, word or chat", () => {
  browser();
  assert.equal(storage.getSelectedTreeId(), null);
  assert.equal(getHomeDataForTree(null).tree, null);
  assert.equal(storage.adoptTree("tree-1"), true);
  assert.equal(storage.getSelectedTreeId(), "tree-1");
  assert.equal(storage.getAdoptionWeeks("tree-1"), 0);
  assert.equal(JSON.parse(storage.getDiaryStorageSnapshot()).adoptionWeeks, 0);
  assert.equal(storage.getActiveTree("tree-1").currentWeek, 14, "growth week stays a separate concept");
  assert.equal(getHomeDataForTree("tree-1").diary, null);
  for (const read of [storage.getLetters, storage.getSavedWords, storage.getChatHistory, storage.getGeneratedDiaries]) assert.deepEqual(read(), []);
  assert.deepEqual(storage.getAllDiaries("tree-1"), []);
  assert.deepEqual(toChatDiaries(storage.getAllDiaries("tree-1"), 14), []);
  assert.equal(getDiaries("tree-1").length, 4, "source getter remains available for integrity checks");
});

test("adoption weeks follow elapsed time, not growth weeks, and re-adopting keeps the first date", () => {
  const { values } = browser();
  assert.equal(storage.adoptTree("tree-1"), true);
  const first = values.get("dandithon.adoption");
  const adoption = JSON.parse(first);
  const adoptedAt = Date.parse(adoption.adoptedAt);
  const day = 24 * 60 * 60 * 1000;
  assert.equal(getAdoptionWeeks(adoption, "tree-1", null, adoptedAt + 7 * day - 1), 0);
  assert.equal(getAdoptionWeeks(adoption, "tree-1", null, adoptedAt + 7 * day), 1);
  assert.equal(getAdoptionWeeks(adoption, "tree-1", null, adoptedAt - day), 0, "a wrong clock never goes negative");
  assert.equal(getAdoptionWeeks(adoption, "tree-2", null, adoptedAt + 70 * day), 0);
  const diary = { ...getDiaries("tree-1")[0], id: "tree-1-w39", week: 39, season: "autumn" };
  assert.equal(storage.addGeneratedDiary(diary), true);
  assert.equal(storage.getActiveTree("tree-1").currentWeek, 39);
  assert.equal(storage.getAdoptionWeeks("tree-1"), 0, "a week 39 diary must not look like 25 weeks together");
  assert.equal(storage.adoptTree("tree-1"), true);
  assert.equal(values.get("dandithon.adoption"), first);
  assert.equal(storage.adoptTree("unknown"), false);
});

test("missing or corrupt adoption records show 0 weeks and do not break the app", () => {
  const { values } = browser();
  for (const raw of [null, "null", "[]", "{broken", '{"treeId":"tree-1"}', '{"treeId":"tree-1","adoptedAt":"nope"}']) {
    if (raw === null) values.delete("dandithon.adoption"); else values.set("dandithon.adoption", raw);
    assert.equal(storage.getAdoptionWeeks("tree-1"), 0);
  }
  assert.equal(storage.getAdoptionWeeks(null), 0);
});

test("the demo user is a past adopter frozen at 25 weeks together and growth week 39", () => {
  const { target, values } = browser();
  assert.equal(installDemoHistory(history, target).ok, true);
  browser(values);
  assert.equal(storage.getAdoptionWeeks("tree-1"), 25);
  assert.equal(storage.getActiveTree("tree-1").currentWeek, 39);
  const adoption = JSON.parse(values.get("dandithon.adoption"));
  const demoState = JSON.parse(values.get("dandithon.demoState"));
  assert.equal(getAdoptionWeeks(adoption, "tree-1", demoState, Date.parse("2030-01-01")), 25, "real time never moves the demo");
  const firstLetter = Math.min(...history.letters.map((letter) => Date.parse(letter.createdAt)));
  assert.ok(Date.parse(adoption.adoptedAt) < firstLetter, "adopted before the first letter");
  assert.equal((Date.parse(history.letters[0].createdAt) - Date.parse(adoption.adoptedAt)) / (7 * 24 * 60 * 60 * 1000), 4,
    "growth week 14 → first letter at growth week 18 keeps the demo calendar consistent");
  for (const seed of [
    { ...history, "dandithon.adoption": null },
    { ...history, "dandithon.adoption": { treeId: "tree-2", adoptedAt: adoption.adoptedAt } },
    { ...history, "dandithon.adoption": { treeId: "tree-1", adoptedAt: demoState.asOf } },
    { ...history, "dandithon.demoState": { version: 1, treeId: "tree-1", currentWeek: 39 } },
  ]) assert.equal(validDemoHistory(seed), false);
});

test("a freshly adopted user blocks demo initialization and keeps every value", () => {
  const { target, values } = browser();
  storage.adoptTree("tree-1");
  const before = [...values];
  assert.deepEqual(installDemoHistory(history, target).existingKeys.sort(), ["dandithon.adoption", "selectedTreeId"]);
  assert.deepEqual([...values], before);
});

test("demo diaries match the published text and keep every letter's linked diary", () => {
  const { target } = browser();
  installDemoHistory(history, target);
  assert.deepEqual(storage.getAllDiaries("tree-1").map((diary) => [diary.week, diary.title, diary.text]),
    getDiaries("tree-1").map((diary) => [diary.week, diary.title, diary.text]));
  assert.deepEqual(storage.getLetters("tree-1").map((letter) => letter.usedInDiaryId),
    ["w18", "w21", "w21", "w28", "w28", "w35", "w35"].map((week) => `tree-1-${week}`));
});

test("new users save letters and later-week diaries without future filtering", () => {
  browser();
  storage.setSelectedTreeId("tree-1");
  assert.equal(storage.addLetter({ treeId: "tree-1", week: 14, text: "테스트 편지" }), true);
  const diary = { ...getDiaries("tree-1")[0], id: "tree-1-w39", week: 39, season: "autumn" };
  assert.equal(storage.addGeneratedDiary(diary), true);
  const snapshot = JSON.parse(storage.getDiaryStorageSnapshot());
  assert.equal(storage.getActiveTree("tree-1").currentWeek, 39);
  assert.equal(getDiaryModel(snapshot, 39).status, "ready");
  assert.equal(getDiaryModel(snapshot, 41).status, "future");
  assert.equal(getHomeDataForTree("tree-1", snapshot.generatedDiaries).diary.week, 39);
  assert.deepEqual(storage.getAllDiaries("tree-1").map(d => d.week), [39]);
  assert.equal(storage.markLetterUsed(storage.getLetters()[0].id, diary.id), true);
});

test("explicit demo survives reload, keeps 39 missing and 41 locked, and supplies Chat evidence", () => {
  const { target, values } = browser();
  assert.equal(installDemoHistory(history, target).ok, true);
  browser(values);
  const snapshot = JSON.parse(storage.getDiaryStorageSnapshot());
  assert.equal(storage.getActiveTree("tree-1").currentWeek, 39);
  assert.equal(getDiaryModel(snapshot, 39).status, "missing");
  assert.equal(getDiaryModel(snapshot, 39).previousDiary.week, 35);
  assert.equal(getDiaryModel(snapshot, 41).status, "future");
  assert.deepEqual(toChatDiaries(storage.getAllDiaries("tree-1"), 39).map(d => d.week), [18, 21, 28, 35]);
  assert.deepEqual(storage.getLetters(), history.letters);
  assert.equal(installDemoHistory(history).ok, false);
});

test("importing initializer writes nothing and an adopted user blocks demo install", async () => {
  const { target, values } = browser();
  await import("../public/demo/initialize.js?side-effect-check");
  assert.equal(values.size, 0);
  storage.setSelectedTreeId("tree-1");
  const before = [...values];
  assert.equal(installDemoHistory(history, target).ok, false);
  assert.deepEqual([...values], before);
});

test("demo marker cannot leak to another tree and corrupt markers never advance new users", () => {
  const { values } = browser();
  for (const state of [null, [], {}, { version: 1, treeId: "other", currentWeek: 39 }, { version: 1, treeId: "tree-1", currentWeek: 53 }]) {
    values.set("dandithon.demoState", JSON.stringify(state));
    assert.equal(storage.getActiveTree("tree-1").currentWeek, 14);
  }
});

test("Chat loading messages change only at 8 and 20 seconds", () => {
  assert.equal(chatDelayMessage(0), "");
  assert.equal(chatDelayMessage(7), "");
  assert.match(chatDelayMessage(8), /조금/);
  assert.match(chatDelayMessage(20), /지연/);
  assert.ok(CHAT_TIMEOUT_MS > 45_000);
});

const payload = { treeId: "tree-1", question: "테스트", messages: [], recentDiaries: [] };
test("Chat aborts a stalled fetch without retrying or modifying storage", async () => {
  const { values } = browser();
  let requests = 0;
  globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) => {
    requests++;
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  await assert.rejects(requestChat(payload, { timeoutMs: 10 }), /시간이 초과/);
  assert.equal(requests, 1);
  assert.equal(values.size, 0);
});

test("Chat distinguishes 429, 502, 504 and network failures", async () => {
  for (const [status, message] of [[429, /한도/], [502, /AI가/], [504, /시간이 초과/]]) {
    globalThis.fetch = async () => Response.json({ error: "private upstream error" }, { status });
    await assert.rejects(requestChat(payload), message);
  }
  globalThis.fetch = async () => { throw new TypeError("network"); };
  await assert.rejects(requestChat(payload), /네트워크/);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const chatTexts = () => storage.getChatHistory("tree-1").map((message) => [message.role, message.text]);

test("double-clicking a sample question sends one request and stores one question", async () => {
  browser();
  storage.adoptTree("tree-1");
  const pending = deferred();
  let requests = 0;
  const request = () => { requests++; return pending.promise; };
  const first = sendChatQuestion("tree-1", "요즘 날씨 어땠어?", { request });
  assert.equal(getActiveChatRequest().treeId, "tree-1");
  assert.deepEqual(await sendChatQuestion("tree-1", "요즘 날씨 어땠어?", { request }), { sent: false });
  assert.deepEqual(await sendChatQuestion("tree-1", "다른 질문", { request }), { sent: false });
  assert.equal(requests, 1);
  assert.deepEqual(chatTexts(), [["user", "요즘 날씨 어땠어?"]]);
  pending.resolve({ answer: "답이데이", source: "18주차 일기" });
  assert.deepEqual(await first, { sent: true });
  assert.equal(getActiveChatRequest(), null);
  assert.deepEqual(chatTexts(), [["user", "요즘 날씨 어땠어?"], ["tree", "답이데이"]]);
  assert.equal(storage.getChatHistory("tree-1")[1].source, "18주차 일기");
});

test("a failed question keeps the conversation and retries without duplicating it", async () => {
  browser();
  storage.adoptTree("tree-1");
  storage.addChatMessage({ treeId: "tree-1", role: "user", text: "이전 질문" });
  storage.addChatMessage({ treeId: "tree-1", role: "tree", text: "이전 답" });
  const sent = [];
  const fail = async (body) => { sent.push(body.messages.length); throw new Error("답변 시간이 초과됐어요. 다시 시도해 주세요."); };
  assert.match((await sendChatQuestion("tree-1", "꽃은 언제 폈어?", { request: fail })).error, /시간이 초과/);
  assert.equal(getActiveChatRequest(), null, "failure releases the lock so the retry is possible");
  assert.deepEqual(chatTexts().at(-1), ["user", "꽃은 언제 폈어?"]);
  let body;
  const succeed = async (input) => { body = input; return { answer: "답", source: null }; };
  assert.deepEqual(await sendChatQuestion("tree-1", "꽃은 언제 폈어?", { request: succeed }), { sent: true });
  assert.deepEqual(chatTexts(), [["user", "이전 질문"], ["tree", "이전 답"], ["user", "꽃은 언제 폈어?"], ["tree", "답"]]);
  assert.deepEqual(body.messages.map((message) => message.text), ["이전 질문", "이전 답"], "the retried question is not sent twice");
  assert.deepEqual(sent, [2]);
});

test("Chat sends only the diaries this user actually sees", async () => {
  const { target, values } = browser();
  let body;
  const request = async (input) => { body = input; return { answer: "답", source: null }; };
  storage.adoptTree("tree-1");
  await sendChatQuestion("tree-1", "새 사용자 질문", { request });
  assert.deepEqual(body.recentDiaries, []);
  values.clear();
  installDemoHistory(history, target);
  await sendChatQuestion("tree-1", "꽃은 언제 폈어?", { request });
  assert.deepEqual(body.recentDiaries.map((diary) => diary.week), [18, 21, 28, 35]);
  assert.deepEqual(body.recentDiaries.map((diary) => diary.text), getDiaries("tree-1").map((diary) => diary.text));
});

test("unsaved questions and answers are reported as errors, never as a success", async () => {
  const { target, values } = browser();
  storage.adoptTree("tree-1");
  const { setItem } = target.localStorage;
  target.localStorage.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
  let requests = 0;
  const failedQuestion = await sendChatQuestion("tree-1", "질문", { request: async () => { requests++; return { answer: "답", source: null }; } });
  assert.match(failedQuestion.error, /질문을 저장하지 못했어요/);
  assert.equal(requests, 0);
  target.localStorage.setItem = setItem;
  const result = await sendChatQuestion("tree-1", "질문", { request: async () => {
    target.localStorage.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
    return { answer: "답", source: null };
  } });
  assert.match(result.error, /답변을 저장하지 못했어요/);
  assert.equal(values.has("chatHistory"), true);
  assert.deepEqual(chatTexts(), [["user", "질문"]]);
});

test("the Chat view shows delays and offers a retry for an unanswered question", async () => {
  const view = await readFile(new URL("../components/chat/ChatView.js", import.meta.url), "utf8");
  assert.match(view, /delayNotice=\{chatDelayMessage\(elapsed\)\}/);
  assert.match(view, /handleSend\(unanswered\)/);
  assert.doesNotMatch(view, /addChatMessage/, "storing messages stays in the single guarded sender");
});

test("the empty diary state keeps its buttons in one row and the back button goes to the timeline", async () => {
  const client = await readFile(new URL("../components/diary/DiaryClient.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../components/diary/Diary.module.css", import.meta.url), "utf8");
  assert.match(client, /<Link href="\/timeline" className="btn-back"/);
  assert.match(client, /지난 일기 보기/);
  assert.match(client, /<Button href="\/timeline" variant="secondary">타임라인 보기<\/Button>/);
  assert.match(css, /\.stateActions \{ display: grid; grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\);/,
    "equal widths despite the secondary border, and a single button fills the row");
  assert.doesNotMatch(css, /\.stateActions[^{]*\{[^}]*(flex-direction: column|flex-wrap: wrap|grid-template-columns: 1fr)/);
});
