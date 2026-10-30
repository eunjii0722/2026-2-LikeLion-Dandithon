"use client";

/* =========================================================
   분양받은 나무 id 읽기 (타임라인·수확 앨범 공용)
   ---------------------------------------------------------
   - undefined: 아직 모름 (서버·첫 화면) → "불러오는 중" 표시
   - null: 고른 나무 없음
   - 문자열: 고른 나무 id
   공통 안내 5-1의 useEffect + setState 방식은 lint
   (react-hooks/set-state-in-effect)에 걸려서 useSyncExternalStore로 구현
   ========================================================= */

import { useSyncExternalStore } from "react";
import { getSelectedTreeId } from "./tempStorage";

function subscribe(onChange) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function useSelectedTreeId() {
  return useSyncExternalStore(subscribe, getSelectedTreeId, () => undefined);
}
