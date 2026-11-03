// Explicit browser-console entry point. Importing this module does not write anything.
export const DEMO_KEYS = Object.freeze(["letters", "generatedDiaries", "savedWords", "chatHistory", "selectedTreeId"]);
const diaryWeeks = [18, 21, 28, 35];
const text = (value) => typeof value === "string" && value.trim().length > 0;

export function validDemoHistory(history) {
  if (!history || Object.keys(history).length !== DEMO_KEYS.length
    || !DEMO_KEYS.every((key) => Object.hasOwn(history, key)) || history.selectedTreeId !== "tree-1"
    || !["letters", "generatedDiaries", "savedWords", "chatHistory"].every((key) => Array.isArray(history[key]))
    || history.generatedDiaries.length || history.chatHistory.length || history.letters.length !== 7) return false;
  if (new Set(history.letters.map((letter) => letter?.id)).size !== history.letters.length) return false;
  if (!history.letters.every((letter) => letter && text(letter.id) && letter.treeId === "tree-1"
    && Number.isInteger(letter.week) && letter.week >= 1 && letter.week <= 35
    && text(letter.text) && letter.text.length <= 200 && text(letter.createdAt) && Number.isFinite(Date.parse(letter.createdAt))
    && diaryWeeks.some((week) => letter.usedInDiaryId === `tree-1-w${week}` && letter.week <= week))) return false;
  return history.savedWords.every((word) => word && text(word.word) && text(word.meaning) && diaryWeeks.includes(word.week))
    && new Set(history.savedWords.map((word) => JSON.stringify([word.word, word.meaning]))).size === history.savedWords.length;
}

export function installDemoHistory(history, target = window) {
  if (!validDemoHistory(history)) return { ok: false, reason: "시연 이력 형식이 올바르지 않습니다. 저장하지 않았습니다." };
  let storage;
  const written = new Map();
  try {
    storage = target.localStorage;
    // Even [] / null / malformed JSON is existing data. Never silently reset it.
    const existingKeys = DEMO_KEYS.filter((key) => storage.getItem(key) !== null);
    if (existingKeys.length) return { ok: false, reason: "기존 데이터가 있어 중단했습니다. 별도의 빈 브라우저 프로필을 사용하세요.", existingKeys };
    for (const key of DEMO_KEYS) {
      if (storage.getItem(key) !== null) throw new Error("concurrent change");
      const serialized = JSON.stringify(history[key]);
      storage.setItem(key, serialized);
      written.set(key, serialized);
      if (storage.getItem(key) !== serialized) throw new Error("write verification failed");
    }
    if ([...written].some(([key, value]) => storage.getItem(key) !== value)) throw new Error("concurrent change");
  } catch {
    let rollbackFailed = false;
    // Only remove values written by this attempt, never other data or another tab's changed value.
    for (const [key, value] of [...written].reverse()) {
      try {
        if (storage.getItem(key) === value) storage.removeItem(key);
        if (storage.getItem(key) === value) rollbackFailed = true;
      } catch { rollbackFailed = true; }
    }
    return { ok: false, reason: rollbackFailed
      ? "저장과 복구를 완료하지 못했습니다. 이 브라우저의 데이터를 확인한 뒤 별도 프로필에서 준비하세요."
      : "저장하지 못했습니다. 이번에 기록한 값은 되돌렸습니다. 저장 권한과 공간을 확인하세요." };
  }
  try { target.dispatchEvent(new target.CustomEvent("diary-storage-change")); }
  catch { /* Values are saved; reopening the page reads them normally. */ }
  return { ok: true, message: "시연 이력을 불러왔습니다. 홈·타임라인·편지·단어장을 확인하세요." };
}

export async function initializeDemo() {
  const run = async () => {
    try {
      const response = await fetch("/demo/history.json", { cache: "no-store" });
      if (!response.ok) return { ok: false, reason: "시연 이력 파일을 불러오지 못했습니다." };
      return installDemoHistory(await response.json());
    } catch { return { ok: false, reason: "시연 이력을 불러오지 못했습니다. 저장하지 않았습니다." }; }
  };
  return navigator.locks ? navigator.locks.request("dandithon-demo-initialize", run) : run();
}
