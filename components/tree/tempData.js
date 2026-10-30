/* =========================================================
   [임시] lib/data.js 대역
   ---------------------------------------------------------
   기획의 lib/data.js와 data/*.json이 main에 올라오면 이 파일을 지우고
   import 경로만 "@/lib/data"로 바꿉니다.
   데이터 모양은 00_공통_프로젝트_안내.md의 '데이터 모양' 그대로입니다.
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

const DIARIES = [
  {
    id: "tree-1-w16",
    treeId: "tree-1",
    week: 16,
    season: "spring",
    title: "분홍 봉오리가 맺힌 한 주",
    text: "일기 본문",
    isSpecial: false,
    dialectWords: [],
    photo: { url: null, type: "orchard" },
    evidence: { growthStage: "개화" },
  },
  {
    id: "tree-1-w18",
    treeId: "tree-1",
    week: 18,
    season: "spring",
    title: "꽃잎이 날리던 한 주",
    text: "일기 본문",
    isSpecial: false,
    dialectWords: [{ word: "쪼매", meaning: "조금" }],
    photo: { url: null, type: "orchard" },
    evidence: { growthStage: "개화" },
  },
  {
    id: "tree-1-w18-special",
    treeId: "tree-1",
    week: 18,
    season: "spring",
    title: "갑자기 우박이 쏟아졌어요",
    text: "일기 본문",
    isSpecial: true,
    dialectWords: [],
    photo: { url: null, type: "orchard" },
    evidence: { growthStage: "개화" },
  },
];

export function getTrees() {
  return TREES;
}

export function getTree(id) {
  return TREES.find((tree) => tree.id === id) ?? null;
}

export function getDiaries(treeId) {
  return DIARIES.filter((diary) => diary.treeId === treeId);
}
