import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import { getDiary, getDiaryModel, getHomeDataForTree } from "../lib/data.js";
import * as store from "../lib/storage.js";
import * as oldDiaryStorage from "../components/diary/diaryStorage.js";
import * as oldHomeStorage from "../components/home/homeStorage.js";

const keys = ["selectedTreeId", "letters", "chatHistory", "generatedDiaries", "savedWords"];
let values, writes, quota;
beforeEach(() => {
  values = new Map(); writes = []; quota = false;
  const target = new EventTarget();
  target.CustomEvent = CustomEvent;
  target.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (quota) throw new DOMException("Quota exceeded", "QuotaExceededError");
      values.set(key, value); writes.push(key);
    },
  };
  globalThis.window = target;
});
after(() => { delete globalThis.window; });
const diary = (title = "생성 결과") => ({ ...getDiary("tree-1", 18), title });
const letter = (id = "letter-1") => ({ id, treeId: "tree-1", week: 18, text: "안녕", createdAt: "2026-05-02T00:00:00.000Z" });
const word = { word: "단디", meaning: "단단히, 꼼꼼히", week: 18 };
function storageEvent(key, storageArea) {
  const event = new Event("storage");
  Object.assign(event, { key, storageArea });
  window.dispatchEvent(event);
}

test("SSR getters and mutations are safe without window", () => {
  delete globalThis.window;
  assert.equal(store.getSelectedTreeId(), null);
  for (const getter of [store.getLetters, store.getChatHistory, store.getGeneratedDiaries, store.getSavedWords]) assert.deepEqual(getter(), []);
  assert.equal(store.getAllDiaries("tree-1").length, 4);
  assert.equal(store.setSelectedTreeId("tree-1"), false);
  assert.equal(store.addLetter(letter()), false);
  assert.equal(store.addGeneratedDiary(diary()), false);
  assert.equal(store.addChatMessage({ treeId: "tree-1", role: "tree", text: "안녕" }), false);
  assert.equal(store.saveWord(word), false);
  assert.doesNotThrow(() => store.subscribeToStorage(() => {})());
  assert.doesNotThrow(() => JSON.parse(store.getDiaryStorageSnapshot()));
});

test("storage access blocked by SecurityError does not break the app", () => {
  Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  assert.equal(store.getSelectedTreeId(), null);
  assert.deepEqual(store.getLetters(), []);
  assert.deepEqual(store.getGeneratedDiaries(), []);
  assert.equal(store.saveWord(word), false);
  assert.equal(store.setSelectedTreeId("tree-1"), false);
});

test("corrupt JSON and wrong array types recover on the next successful write", () => {
  for (const bad of ["{broken", "null", "{}", "12", '"string"']) {
    for (const key of keys) values.set(key, bad);
    assert.equal(store.getSelectedTreeId(), null);
    for (const getter of [store.getLetters, store.getChatHistory, store.getGeneratedDiaries, store.getSavedWords]) assert.deepEqual(getter(), []);
    assert.equal(store.getAllDiaries("tree-1").length, 4);
    assert.equal(store.setSelectedTreeId("tree-1"), true);
    assert.equal(store.addLetter(letter()), true);
    assert.equal(store.addGeneratedDiary(diary()), true);
    assert.equal(store.addChatMessage({ treeId: "tree-1", role: "user", text: "안녕" }), true);
    assert.equal(store.saveWord(word), true);
  }
  assert.ok(writes.every(key => keys.includes(key)));
});

test("malformed array entries are ignored while valid legacy entries survive", () => {
  values.set("letters", JSON.stringify([null, [], {}, letter()]));
  values.set("savedWords", JSON.stringify([null, {}, { ...word, week: -1 }, word]));
  values.set("chatHistory", JSON.stringify([{}, { treeId: "tree-1", role: "tree", content: "나무" }]));
  values.set("generatedDiaries", JSON.stringify([{}, null, { ...diary(), photo: null }, diary()]));
  assert.equal(store.getLetters().length, 1);
  assert.deepEqual(store.getSavedWords(), [word]);
  assert.equal(store.getChatHistory()[0].role, "tree");
  assert.equal(store.getGeneratedDiaries().length, 1);
});

test("selected tree uses the existing JSON string key and can be cleared", () => {
  assert.equal(store.setSelectedTreeId("tree-1"), true);
  assert.equal(values.get("selectedTreeId"), '"tree-1"');
  assert.equal(oldHomeStorage.getSelectedTreeId(), "tree-1");
  for (const bad of [undefined, {}, "unknown", ""]) assert.equal(store.setSelectedTreeId(bad), false);
  assert.equal(store.setSelectedTreeId(null), true);
  assert.equal(values.get("selectedTreeId"), "null");
});

test("static and generated diaries merge, last same-ID generation wins, special diary survives", () => {
  assert.equal(store.addGeneratedDiary(diary("first")), true);
  assert.equal(store.addGeneratedDiary(diary("latest")), true);
  assert.equal(store.getGeneratedDiaries().length, 1);
  const special = { ...diary(), id: "tree-1-w18-special", isSpecial: true };
  assert.equal(store.addGeneratedDiary(special), true);
  const all = store.getAllDiaries("tree-1");
  assert.equal(all.length, 5);
  assert.equal(all.find(item => item.id === "tree-1-w18").title, "latest");
  assert.ok(all.some(item => item.id === "tree-1-w18-special"));
  const snapshot = JSON.parse(store.getDiaryStorageSnapshot());
  assert.equal(getDiaryModel({ treeId: "tree-1", generatedDiaries: snapshot.generatedDiaries }, 18).diary.title, "latest");
  assert.equal(getHomeDataForTree("tree-1", snapshot.generatedDiaries).diary.id, "tree-1-w35");
  assert.deepEqual(store.getAllDiaries("missing"), []);
});

test("old duplicate generated IDs use the last result without leaking another tree", () => {
  values.set("generatedDiaries", JSON.stringify([diary("old"), diary("new"), { ...diary("foreign"), treeId: "tree-2" }]));
  assert.equal(store.getGeneratedDiaries("tree-1").length, 1);
  assert.equal(store.getAllDiaries("tree-1").find(item => item.id === "tree-1-w18").title, "new");
  assert.equal(store.addGeneratedDiary({ ...diary(), treeId: "missing" }), false);
  assert.equal(store.addGeneratedDiary(diary()), false, "conflicting foreign ID must not be overwritten");
});

test("tree-scoped reads keep letters, chat and generated diaries separate", () => {
  values.set("letters", JSON.stringify([letter(), { ...letter("other"), treeId: "tree-2" }]));
  values.set("chatHistory", JSON.stringify(["tree-1", "tree-2"].map(treeId => ({ treeId, role: "user", text: "hi" }))));
  values.set("generatedDiaries", JSON.stringify([diary(), { ...diary(), id: "tree-2-w18", treeId: "tree-2" }]));
  for (const getter of [store.getLetters, store.getChatHistory, store.getGeneratedDiaries]) {
    assert.equal(getter().length, 2, "no-argument adapter contract is all records");
    assert.equal(getter("tree-1").length, 1);
    assert.ok(getter("tree-1").every(item => item.treeId === "tree-1"));
  }
});

test("letter consumption requires a successfully persisted generation for the same tree", () => {
  assert.equal(store.addLetter(letter()), true);
  assert.equal(store.markLetterUsed("letter-1", "tree-1-w18"), false, "static diary is insufficient");
  quota = true;
  assert.equal(store.addGeneratedDiary(diary()), false);
  assert.equal(store.markLetterUsed("letter-1", "tree-1-w18"), false);
  assert.equal(store.getLetters()[0].usedInDiaryId, null);
  quota = false;
  assert.equal(store.addGeneratedDiary(diary()), true);
  quota = true;
  assert.equal(store.markLetterUsed("letter-1", "tree-1-w18"), false);
  assert.equal(store.getLetters()[0].usedInDiaryId, null);
  quota = false;
  assert.equal(store.markLetterUsed("letter-1", "tree-1-w18"), true);
  assert.equal(store.getLetters()[0].usedInDiaryId, "tree-1-w18");
  assert.equal(store.markLetterUsed("letter-1", "tree-1-w18"), true);
  assert.equal(store.addLetter(letter()), false, "do not duplicate or unconsume an existing letter");
  assert.equal(store.addLetter({ ...letter("prefilled"), usedInDiaryId: "tree-1-w18" }), false);
});

test("letters cannot be consumed by a foreign-tree diary or reassigned to another diary", () => {
  assert.equal(store.addLetter(letter()), true);
  values.set("generatedDiaries", JSON.stringify([{ ...diary(), treeId: "tree-2", id: "tree-2-w18" }]));
  assert.equal(store.markLetterUsed("letter-1", "tree-2-w18"), false);
  assert.equal(store.addGeneratedDiary(diary()), true);
  assert.equal(store.markLetterUsed("letter-1", "tree-1-w18"), true);
  assert.equal(store.addGeneratedDiary({ ...diary(), id: "another" }), true);
  assert.equal(store.markLetterUsed("letter-1", "another"), false);
});

test("letter defaults preserve existing field names and new writes return booleans", () => {
  assert.equal(store.addLetter({ treeId: "tree-1", week: 18, text: "hello" }), true);
  const saved = store.getLetters()[0];
  assert.deepEqual(Object.keys(saved).sort(), ["createdAt", "id", "text", "treeId", "usedInDiaryId", "week"]);
  assert.ok(saved.id && Number.isFinite(Date.parse(saved.createdAt)));
  assert.equal(saved.usedInDiaryId, null);
});

test("saved word shape and deduplication match Diary adapter without adding treeId", () => {
  assert.equal(store.saveWord(word), true);
  assert.deepEqual(oldDiaryStorage.getSavedWords(), [word]);
  assert.equal(oldDiaryStorage.saveWord({ word: "쪼매", meaning: "조금", week: 16 }), true);
  assert.equal(store.getSavedWords().length, 2);
  const before = writes.length;
  assert.equal(store.saveWord({ ...word, week: 16 }), true);
  assert.equal(writes.length, before);
  assert.deepEqual(store.getSavedWords()[0], word);
});

test("Chat keeps user/tree roles and existing text/content fields unchanged", () => {
  const first = { treeId: "tree-1", role: "user", text: "질문" };
  const second = { treeId: "tree-1", role: "tree", content: "답변" };
  assert.equal(store.addChatMessage(first), true);
  assert.equal(store.addChatMessage(second), true);
  assert.deepEqual(JSON.parse(values.get("chatHistory")), [first, second]);
  assert.equal(store.addChatMessage({ ...second, role: "assistant" }), false);
  assert.equal(store.addChatMessage({ ...first, treeId: "missing" }), false);
});

test("quota failures keep previous values and never emit success notifications", () => {
  assert.equal(store.setSelectedTreeId("tree-1"), true);
  assert.equal(store.addGeneratedDiary(diary("saved")), true);
  assert.equal(store.addLetter(letter()), true);
  assert.equal(store.saveWord(word), true);
  const original = new Map(values);
  let notifications = 0;
  const unsubscribe = store.subscribeToStorage(() => { notifications++; });
  quota = true;
  assert.equal(store.setSelectedTreeId(null), false);
  assert.equal(store.addGeneratedDiary(diary("unsaved")), false);
  assert.equal(store.addLetter(letter("new")), false);
  assert.equal(store.saveWord({ word: "쪼매", meaning: "조금", week: 18 }), false);
  assert.equal(store.addChatMessage({ treeId: "tree-1", role: "user", text: "q" }), false);
  assert.deepEqual(values, original);
  assert.equal(notifications, 0);
  unsubscribe();
});

test("a storage implementation that silently drops a write returns false", () => {
  window.localStorage.setItem = () => {};
  assert.equal(store.setSelectedTreeId("tree-1"), false);
  assert.equal(store.addGeneratedDiary(diary()), false);
});

test("same-tab changes, cross-tab events, pageshow/focus and unsubscribe work", () => {
  let selected = 0, diaryChanges = 0, legacy = 0;
  const offSelected = store.subscribeToSelectedTree(() => { selected++; });
  const offDiary = store.subscribeToDiary(() => { diaryChanges++; });
  const offLegacy = oldDiaryStorage.subscribeToDiary(() => { legacy++; });
  assert.equal(store.setSelectedTreeId("tree-1"), true);
  assert.equal(selected, 1); assert.equal(diaryChanges, 1); assert.equal(legacy, 1);
  store.saveWord(word);
  assert.equal(selected, 1); assert.equal(diaryChanges, 2);
  store.addGeneratedDiary(diary());
  assert.equal(diaryChanges, 3);
  storageEvent("selectedTreeId", window.localStorage);
  assert.equal(selected, 2);
  storageEvent("letters", window.localStorage);
  assert.equal(selected, 2); assert.equal(diaryChanges, 4);
  storageEvent("selectedTreeId", {});
  assert.equal(selected, 2);
  storageEvent(null, window.localStorage);
  assert.equal(selected, 3);
  window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow"));
  assert.equal(selected, 5);
  offSelected(); offDiary(); offLegacy();
  store.setSelectedTreeId(null);
  assert.equal(selected, 5);
});

test("snapshot is stable, compatible with B, read-only and immutable across callers", () => {
  store.setSelectedTreeId("tree-1"); store.addGeneratedDiary(diary()); store.saveWord(word);
  const snapshot = store.getDiaryStorageSnapshot();
  const before = writes.length;
  assert.equal(snapshot, store.getDiaryStorageSnapshot());
  assert.deepEqual(JSON.parse(snapshot), JSON.parse(oldDiaryStorage.getDiaryStorageSnapshot()));
  assert.equal(writes.length, before);
  store.getGeneratedDiaries()[0].title = "external mutation";
  assert.equal(store.getGeneratedDiaries()[0].title, "생성 결과");
});

test("only the five agreed keys are ever written", () => {
  store.setSelectedTreeId("tree-1"); store.addLetter(letter()); store.addGeneratedDiary(diary());
  store.saveWord(word); store.addChatMessage({ treeId: "tree-1", role: "tree", text: "hi" });
  assert.deepEqual([...values.keys()].sort(), keys.slice().sort());
});
