// 테스트용: 공통 lib/storage.js가 준비되기 전까지 사용
// A의 분양 버튼이 저장하는 기존 키·JSON 형식을 그대로 읽고 새 키를 만들지 않음.
const SELECTED_TREE_KEY = "selectedTreeId";

export function getSelectedTreeId() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SELECTED_TREE_KEY));
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    // 저장소 접근이 차단되거나 JSON이 손상돼도 홈 표시
    return null;
  }
}

export function subscribeToSelectedTree(onChange) {
  function onStorage(event) {
    if (event.key === SELECTED_TREE_KEY || event.key === null) onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onChange);
    window.removeEventListener("focus", onChange);
  };
}
