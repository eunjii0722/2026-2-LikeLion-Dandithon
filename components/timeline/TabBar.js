/* =========================================================
   [호환용] 공통 하단 메뉴 연결
   ---------------------------------------------------------
   하단 메뉴는 components/common/TabBar(C 담당)를 씁니다.
   홈(components/home/HomeView.js)이 아직 이 경로를 불러오고 있어서
   예전 사용법(current, diaryWeek)을 받아 공통 메뉴로 넘겨줍니다.
   홈이 공통 TabBar로 바뀌면 이 파일을 지웁니다.
   ========================================================= */

import CommonTabBar from "@/components/common/TabBar";

export default function TabBar({ diaryWeek }) {
  return <CommonTabBar currentWeek={diaryWeek} />;
}
