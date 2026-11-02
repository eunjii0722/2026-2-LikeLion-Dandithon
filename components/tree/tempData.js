/* =========================================================
   [사용 중지] 예전 임시 나무 데이터
   ---------------------------------------------------------
   화면은 모두 lib/data.js를 씁니다. 이 파일은 화면에서 쓰지 않습니다.
   tests/common-data.test.mjs가 공통 데이터와 예전 A 데이터가 같은지
   비교하려고 getTrees()를 불러오고 있어서 남겨 둡니다.
   테스트 담당과 정리되면 지웁니다.
   ========================================================= */

const TREES = [
  {
    id: "tree-1",
    name: "홍이",
    variety: "[품종]",
    farm: { name: "[○○농원]", region: "청송", dialectRegion: "경북 북부" },
    photo: null,
    startWeek: 14,
    harvestWeek: 41,
    currentWeek: 18,
  },
];

export function getTrees() {
  return TREES;
}
