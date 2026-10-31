// 1단계 나무·일기 목업, 선택 상태는 homeStorage.js에서 읽음.
// TODO: 공통 모듈 준비 후 lib/data.js의 데이터 함수로 교체
// 데이터 모양은 공통 안내의 나무·주간 일기 명세를 따름.
const MOCK_TREE = {
  id: "tree-1",
  name: "홍이",
  variety: "[품종]",
  farm: { name: "[○○농원]", region: "청송", dialectRegion: "경북 북부" },
  photo: null,
  startWeek: 14,
  harvestWeek: 41,
  currentWeek: 18,
};

const MOCK_DIARY = {
  id: "tree-1-w18",
  treeId: "tree-1",
  week: 18,
  season: "spring",
  title: "꽃잎이 날리던 한 주",
  text: "꽃잎이 바람에 날리는 한 주였니더. 벌들이 쪼매 바빴어요.",
  isSpecial: false,
  dialectWords: [{ word: "쪼매", meaning: "조금" }],
  photo: { url: null, type: "orchard" },
  evidence: {
    growthStage: "개화",
    confidence: "높음",
    farmerConfirmed: false,
    observedAt: "2026-05-02",
    weather: { tempMax: 22, tempMin: 8, rainMm: 0 },
    farmerNote: "화면 확인용 예시 기록",
  },
};

export const SEASON_NAMES = {
  spring: "봄", summer: "여름", autumn: "가을", winter: "겨울",
};

export const STAGE_DESCRIPTIONS = {
  휴면: "다음 계절을 준비하고 있어요",
  개화: "꽃이 피었어요",
  착과: "작은 열매가 맺혔어요",
  비대: "열매가 자라고 있어요",
  착색: "사과가 익어가고 있어요",
  수확기: "수확할 때가 되었어요",
};

export function getHomeDataForTree(selectedTreeId) {
  return selectedTreeId === MOCK_TREE.id
    ? { tree: MOCK_TREE, diary: MOCK_DIARY }
    : { tree: null, diary: null };
}
