// 공통 lib/data.js 준비 전 B 담당 목업으로 실제 AI 생성 결과를 화면에서 고치지 않는다.
const TREE = {
  id: "tree-1", name: "홍이", variety: "[품종]",
  farm: { name: "[○○농원]", region: "청송", dialectRegion: "경북 북부" },
  photo: null, startWeek: 14, harvestWeek: 41, currentWeek: 18,
};

const DIARIES = [
  {
    id: "tree-1-w16", treeId: "tree-1", week: 16, season: "spring",
    title: "분홍 봉오리가 맺힌 한 주",
    text: "분홍 봉오리가 맺혔니더. 농부 아재가 단디 살펴보고 갔어요.",
    isSpecial: false, dialectWords: [{ word: "단디", meaning: "단단히, 꼼꼼히" }],
    photo: { url: null, type: "tree" },
    evidence: {
      growthStage: "개화", confidence: "보통", farmerConfirmed: true,
      observedAt: "2026-04-18", weather: { tempMax: 18, tempMin: 6, rainMm: 0 },
      farmerNote: "화면 확인용 예시: 나무에 분홍 봉오리가 맺혔어요.",
    },
  },
  {
    id: "tree-1-w18", treeId: "tree-1", week: 18, season: "spring",
    title: "꽃잎이 날리던 한 주",
    text: "꽃잎이 바람에 날리는 한 주였니더. 벌들이 쪼매 바빴어요.\n농부 아재가 과수원을 단디 둘러보고 갔어요. 이번 주는 과수원 전체 모습을 담았니더.",
    isSpecial: false,
    dialectWords: [{ word: "쪼매", meaning: "조금" }, { word: "단디", meaning: "단단히, 꼼꼼히" }],
    photo: { url: null, type: "orchard" },
    evidence: {
      growthStage: "개화", confidence: "높음", farmerConfirmed: false,
      observedAt: "2026-05-02", weather: { tempMax: 22, tempMin: 8, rainMm: 0 },
      farmerNote: "화면 확인용 예시: 과수원에 꽃이 피었고 벌이 오가는 모습이 보여요.",
    },
  },
  {
    id: "tree-1-w18-special", treeId: "tree-1", week: 18, season: "spring",
    title: "갑자기 우박이 쏟아졌어요",
    text: "오늘 과수원에 우박이 내렸니더. 농부 아재가 과수원을 둘러봤다고 소식을 남겼어요.",
    isSpecial: true, dialectWords: [], photo: { url: null, type: "orchard" },
    evidence: {
      growthStage: "판단 불가", confidence: "낮음", farmerConfirmed: true,
      observedAt: "2026-05-02", weather: { tempMax: 22, tempMin: 8, rainMm: 6 },
      farmerNote: "화면 확인용 예시: 우박이 내린 뒤 과수원을 둘러봤어요. 피해 여부는 아직 확인 중이에요.",
    },
  },
];

export const SEASON_NAMES = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

export function getDiaryModel({ treeId, generatedDiaries = [] }, week, diaryId) {
  if (treeId !== TREE.id) return { status: "no-tree" };
  if (week > TREE.currentWeek) return { status: "future", tree: TREE };
  const merged = new Map(DIARIES.map((diary) => [diary.id, diary]));
  for (const diary of generatedDiaries) {
    if (diary && diary.treeId === treeId && typeof diary.id === "string"
      && Number.isInteger(diary.week) && diary.week > 0
      && typeof diary.text === "string" && typeof diary.title === "string") {
      merged.set(diary.id, diary);
    }
  }
  const available = [...merged.values()].filter((diary) => diary.week <= TREE.currentWeek);
  const sameWeek = available.filter((diary) => diary.week === week);
  const diary = diaryId ? sameWeek.find((item) => item.id === diaryId)
    : sameWeek.find((item) => !item.isSpecial) ?? sameWeek[0];
  if (!diary) return { status: "missing", tree: TREE };
  const weeks = [...new Set(available.filter((item) => !item.isSpecial).map((item) => item.week))]
    .sort((a, b) => a - b);
  return {
    status: "ready", tree: TREE, diary,
    previousWeek: weeks.filter((value) => value < week).at(-1) ?? null,
    nextWeek: weeks.find((value) => value > week) ?? null,
    related: sameWeek.filter((item) => item.id !== diary.id),
  };
}

export function getDiaryHref(diary) {
  return `/diary/${diary.week}${diary.isSpecial ? `?id=${encodeURIComponent(diary.id)}` : ""}`;
}
