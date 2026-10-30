/* =========================================================
   [임시] lib/storage.js 대역 (브라우저 localStorage)
   ---------------------------------------------------------
   기획의 lib/storage.js가 main에 올라오면 이 파일을 지우고
   import 경로만 "@/lib/storage"로 바꿉니다.
   키 이름은 00_공통_프로젝트_안내.md의 '브라우저 저장소 키' 그대로입니다.
   ========================================================= */

import { getDiaries } from "./tempData";

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없는 브라우저(사생활 보호 모드 등)는 조용히 넘어감
  }
}

export function setSelectedTreeId(id) {
  write("selectedTreeId", id);
}

export function getSelectedTreeId() {
  return read("selectedTreeId", null);
}

/* JSON 일기 + 농부 화면에서 새로 만든 일기. 같은 id면 새로 만든 쪽 사용 */
export function getAllDiaries(treeId) {
  const generated = read("generatedDiaries", []).filter((diary) => diary.treeId === treeId);
  const generatedIds = new Set(generated.map((diary) => diary.id));
  return [...getDiaries(treeId).filter((diary) => !generatedIds.has(diary.id)), ...generated];
}
