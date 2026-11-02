// 화면에서 사용하지 않는 이전 구현으로 tests/common-*.test.mjs의 호환성 비교용
// TODO: 공통 테스트 후 비교 자료를 분리한 뒤 해당 파일 삭제
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
