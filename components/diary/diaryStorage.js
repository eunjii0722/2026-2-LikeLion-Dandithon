// 공통 lib/storage.js 준비 전 B 담당 임시 어댑터로 공통 안내의 기존 키만 사용한다.
function read(key, fallback) {
  try { return JSON.parse(window.localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function getSavedWords() {
  const words = read("savedWords", []);
  return Array.isArray(words) ? words.filter((item) => item
    && typeof item.word === "string" && typeof item.meaning === "string"
    && Number.isInteger(item.week)) : [];
}

export function saveWord({ word, meaning, week }) {
  if (typeof word !== "string" || !word.trim() || typeof meaning !== "string"
    || !Number.isInteger(week) || week < 1) return false;
  try {
    const words = getSavedWords();
    if (words.some((item) => item.word === word && item.meaning === meaning)) return true;
    window.localStorage.setItem("savedWords", JSON.stringify([...words, { word, meaning, week }]));
    window.dispatchEvent(new Event("diary-storage-change"));
    return true;
  } catch { return false; }
}

export function getDiaryStorageSnapshot() {
  const selected = read("selectedTreeId", null);
  const generated = read("generatedDiaries", []);
  return JSON.stringify({
    treeId: typeof selected === "string" ? selected : null,
    generatedDiaries: Array.isArray(generated) ? generated : [],
    savedWords: getSavedWords(),
  });
}

export function subscribeToDiary(onChange) {
  function onStorage(event) {
    if (event.key === null || ["selectedTreeId", "generatedDiaries", "savedWords"].includes(event.key)) onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener("diary-storage-change", onChange);
  window.addEventListener("pageshow", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("diary-storage-change", onChange);
    window.removeEventListener("pageshow", onChange);
    window.removeEventListener("focus", onChange);
  };
}
