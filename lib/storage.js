import { getAdoptionWeeks as adoptionWeeksOf, getTree, getUserTree, isDiary, getUserDiaries } from "./data.js";

// 기존 다섯 키·JSON 형식을 유지합니다. savedWords는 treeId 없는 공용 개인 단어장입니다.
const KEYS = ["selectedTreeId", "letters", "chatHistory", "generatedDiaries", "savedWords"];
const ADOPTION_KEY = "dandithon.adoption";
const CHANGE_EVENT = "diary-storage-change";
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const weekNumber = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 53;

function browser() { return typeof window === "undefined" ? null : window; }
function read(key, fallback) {
  try {
    const raw = browser()?.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
function readArray(key, valid) {
  const value = read(key, []);
  return Array.isArray(value) ? value.filter(valid) : [];
}
function write(key, value) {
  const target = browser();
  if (!target) return false;
  try {
    const serialized = JSON.stringify(value);
    target.localStorage.setItem(key, serialized);
    if (target.localStorage.getItem(key) !== serialized) return false;
  } catch { return false; }
  // 알림 실패를 저장 실패로 오인하지 않도록, 쓰기 성공 후 별도로 알립니다.
  try { target.dispatchEvent(new target.CustomEvent(CHANGE_EVENT, { detail: { key } })); }
  catch { /* 저장 자체는 성공했습니다. */ }
  return true;
}
function id() {
  return browser()?.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const validLetter = (value) => record(value) && text(value.id) && text(value.treeId)
  && weekNumber(value.week) && text(value.text)
  && (value.createdAt === undefined || typeof value.createdAt === "string")
  && (value.usedInDiaryId == null || text(value.usedInDiaryId));
const validMessage = (value) => record(value) && text(value.treeId) && ["user", "tree"].includes(value.role)
  && text(value.content ?? value.text ?? value.message);
const validWord = (value) => record(value) && text(value.word) && text(value.meaning) && weekNumber(value.week);
const forTree = (items, treeId) => treeId === undefined ? items : items.filter((item) => item.treeId === treeId);

export function getSelectedTreeId() {
  const selected = read("selectedTreeId", null);
  return typeof selected === "string" && getTree(selected) ? selected : null;
}
export function setSelectedTreeId(treeId) {
  if (treeId !== null && (typeof treeId !== "string" || !getTree(treeId))) return false;
  return write("selectedTreeId", treeId);
}
// 분양 완료 전용입니다. 같은 나무를 다시 분양해도 처음 분양한 시점을 유지합니다.
export function adoptTree(treeId) {
  if (typeof treeId !== "string" || !getTree(treeId)) return false;
  if (read(ADOPTION_KEY, null)?.treeId !== treeId
    && !write(ADOPTION_KEY, { treeId, adoptedAt: new Date().toISOString() })) return false;
  return setSelectedTreeId(treeId);
}
export function getAdoptionWeeks(treeId) { return adoptionWeeksOf(read(ADOPTION_KEY, null), treeId, getDemoState()); }

// 인자 없는 getter는 기존 A/B와 같은 전체 배열입니다. 화면에서는 treeId로 필터링합니다.
export function getLetters(treeId) { return forTree(readArray("letters", validLetter), treeId); }
export function addLetter(letter) {
  if (!record(letter) || !getTree(letter.treeId) || !weekNumber(letter.week) || !text(letter.text)
    || letter.usedInDiaryId != null) return false;
  const value = { ...letter, id: letter.id ?? id(), createdAt: letter.createdAt ?? new Date().toISOString(), usedInDiaryId: null };
  if (!validLetter(value)) return false;
  const existing = getLetters();
  if (existing.some((item) => item.id === value.id)) return false;
  return write("letters", [...existing, value]);
}
export function markLetterUsed(letterId, diaryId) {
  const letters = getLetters();
  const letter = letters.find((item) => item.id === letterId);
  // API 성공 후 생성 결과가 저장됐을 때만 소비 가능합니다. 정적 일기로는 소비하지 않습니다.
  if (!letter || !getGeneratedDiaries(letter.treeId).some((diary) => diary.id === diaryId)
    || (letter.usedInDiaryId != null && letter.usedInDiaryId !== diaryId)) return false;
  if (letter.usedInDiaryId === diaryId) return true;
  return write("letters", letters.map((item) => item.id === letterId ? { ...item, usedInDiaryId: diaryId } : item));
}

export function getChatHistory(treeId) { return forTree(readArray("chatHistory", validMessage), treeId); }
export function addChatMessage(message) {
  if (!validMessage(message) || !getTree(message.treeId)) return false;
  // role: tree를 그대로 저장합니다. API로 보낼 때 assistant로 변환하는 것은 호출자의 책임입니다.
  return write("chatHistory", [...getChatHistory(), message]);
}

export function getGeneratedDiaries(treeId) {
  const valid = forTree(readArray("generatedDiaries", isDiary), treeId);
  // 기존 중복 데이터도 읽을 때 최신을 우선하며 다른 나무의 같은 ID로 덮어쓰지 않습니다.
  const unique = new Map(valid.map((diary) => [JSON.stringify([diary.treeId, diary.id]), diary]));
  return [...unique.values()];
}
export function addGeneratedDiary(diary) {
  if (!isDiary(diary) || !getTree(diary.treeId)) return false;
  const existing = getGeneratedDiaries();
  if (existing.some((item) => item.id === diary.id && item.treeId !== diary.treeId)) return false;
  return write("generatedDiaries", [...existing.filter((item) => item.id !== diary.id), diary]);
}
export function getAllDiaries(treeId) { return getUserDiaries(treeId, getGeneratedDiaries(treeId)); }

export function getDemoState() { return read("dandithon.demoState", null); }
export function getActiveTree(treeId) { return getUserTree(treeId, getGeneratedDiaries(treeId), getDemoState()); }

export function getSavedWords() { return readArray("savedWords", validWord); }
export function saveWord(value) {
  if (!validWord(value)) return false;
  const words = getSavedWords();
  if (words.some((item) => item.word === value.word && item.meaning === value.meaning)) return true;
  return write("savedWords", [...words, { word: value.word, meaning: value.meaning, week: value.week }]);
}

// useSyncExternalStore の snapshot は同じ内容なら同じ文字列。読込時の書込や状態変更はしません。
export function getDiaryStorageSnapshot() {
  const treeId = getSelectedTreeId();
  return JSON.stringify({ treeId, generatedDiaries: getGeneratedDiaries(), savedWords: getSavedWords(), demoState: getDemoState(), adoptionWeeks: getAdoptionWeeks(treeId) });
}
export function subscribeToStorage(onChange, keys = KEYS) {
  const target = browser();
  if (!target || typeof onChange !== "function") return () => {};
  const selectedKeys = new Set([...keys, "dandithon.demoState", ADOPTION_KEY]);
  function onStorage(event) {
    try {
      if (event.storageArea && event.storageArea !== target.localStorage) return;
    } catch { return; }
    if (event.key === null || selectedKeys.has(event.key)) onChange();
  }
  function onLocalChange(event) {
    if (!event.detail?.key || selectedKeys.has(event.detail.key)) onChange();
  }
  target.addEventListener("storage", onStorage);
  target.addEventListener(CHANGE_EVENT, onLocalChange);
  target.addEventListener("pageshow", onChange);
  target.addEventListener("focus", onChange);
  return () => {
    target.removeEventListener("storage", onStorage);
    target.removeEventListener(CHANGE_EVENT, onLocalChange);
    target.removeEventListener("pageshow", onChange);
    target.removeEventListener("focus", onChange);
  };
}
export function subscribeToSelectedTree(onChange) { return subscribeToStorage(onChange, ["selectedTreeId"]); }
export function subscribeToDiary(onChange) {
  return subscribeToStorage(onChange, ["selectedTreeId", "generatedDiaries", "savedWords"]);
}
