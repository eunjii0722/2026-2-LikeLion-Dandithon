// 정적 시연 자료입니다. 실제 농가 관측·기상 데이터로 사용하지 않습니다.
// JSON import attributes는 Next.js와 Node.js 20.10+/22+에서 지원합니다.
import trees from "../data/trees.json" with { type: "json" };
import diaries from "../data/diaries.json" with { type: "json" };
import words from "../data/words.json" with { type: "json" };
import weather from "../data/weather.json" with { type: "json" };

export const SEASON_NAMES = Object.freeze({ spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" });
export const STAGE_DESCRIPTIONS = Object.freeze({
  휴면: "다음 계절을 준비하고 있어요", 개화: "꽃이 피었어요", 착과: "작은 열매가 맺혔어요",
  비대: "열매가 자라고 있어요", 착색: "사과가 익어가고 있어요", 수확기: "수확할 때가 되었어요",
});
export const HARVEST_SOON_STAGE = "수확 직전";

const copy = (value) => JSON.parse(JSON.stringify(value));
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const weekNumber = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 53;
const nullableText = (value) => value === null || typeof value === "string";

function validDate(value) {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}

// API가 반환하는 공통 일기 형식을 검사합니다. 모르는 근거는 null로 둘 수 있습니다.
export function isDiary(value) {
  if (!record(value) || !text(value.id) || !text(value.treeId) || !weekNumber(value.week)
    || !Object.hasOwn(SEASON_NAMES, value.season) || !text(value.title) || !text(value.text)
    || typeof value.isSpecial !== "boolean" || !Array.isArray(value.dialectWords)
    || !value.dialectWords.every((item) => record(item) && text(item.word) && text(item.meaning))
    || !record(value.photo) || !nullableText(value.photo.url) || !["tree", "orchard"].includes(value.photo.type)
    || !record(value.evidence)
    || (value.displayStage !== undefined && !Object.hasOwn(STAGE_DESCRIPTIONS, value.displayStage))) return false;
  const evidence = value.evidence;
  return (evidence.growthStage === null || Object.hasOwn(STAGE_DESCRIPTIONS, evidence.growthStage)
      || evidence.growthStage === "판단 불가")
    && [null, "높음", "보통", "낮음"].includes(evidence.confidence)
    && (evidence.farmerConfirmed === null || typeof evidence.farmerConfirmed === "boolean")
    && validDate(evidence.observedAt) && nullableText(evidence.farmerNote)
    && (evidence.weather === null || (record(evidence.weather)
      && ["tempMax", "tempMin", "rainMm"].every((key) => Number.isFinite(evidence.weather[key]))
      && evidence.weather.tempMax >= evidence.weather.tempMin && evidence.weather.rainMm >= 0));
}

export function getTrees() { return copy(trees); }
export function getTree(id) { return copy(trees.find((tree) => tree.id === id) ?? null); }
export function getDiaries(treeId) { return copy(diaries.filter((diary) => diary.treeId === treeId)); }
export function getWords() { return copy(words); }

// 날짜별 조회 규격·출처가 미확정입니다. 빈 초기 배열만 제공하며 날짜별 값을 추정하지 않습니다.
export function getWeather() { return copy(weather); }

// 같은 ID는 마지막 유효 생성 결과로 교체합니다. 다른 나무의 동일 ID로 덮어쓰지 않습니다.
export function mergeDiaries(treeId, generatedDiaries = []) {
  if (!getTree(treeId)) return [];
  const merged = new Map(getDiaries(treeId).map((diary) => [diary.id, diary]));
  for (const diary of Array.isArray(generatedDiaries) ? generatedDiaries : []) {
    if (isDiary(diary) && diary.treeId === treeId) merged.set(diary.id, copy(diary));
  }
  return [...merged.values()].sort((a, b) => a.week - b.week || Number(a.isSpecial) - Number(b.isSpecial)
    || a.id.localeCompare(b.id));
}

// User screens read only explicitly saved records. Static fixtures remain available via getDiaries.
export function getUserDiaries(treeId, saved = []) {
  if (!getTree(treeId)) return [];
  const unique = new Map();
  for (const diary of Array.isArray(saved) ? saved : []) {
    if (isDiary(diary) && diary.treeId === treeId) unique.set(diary.id, copy(diary));
  }
  return [...unique.values()].sort((a, b) => a.week - b.week || Number(a.isSpecial) - Number(b.isSpecial) || a.id.localeCompare(b.id));
}

const isDemoState = (demoState, treeId) => demoState?.version === 1 && demoState.treeId === treeId && demoState.currentWeek === 39;

// 시연 초기화도 generatedDiaries에 저장하므로 저장 위치만으로 출처를 구분할 수 없습니다.
// 같은 주차를 실제로 다시 생성하면 내용이 달라져 시연 자료로 분류하지 않습니다.
export function isDemoDiary(diary, demoState) {
  if (!isDiary(diary) || !isDemoState(demoState, diary.treeId)) return false;
  const fixture = diaries.find((item) => item.id === diary.id && item.treeId === diary.treeId);
  return Boolean(fixture) && JSON.stringify(fixture) === JSON.stringify(diary);
}

// tree.currentWeek은 생육 주차입니다. 분양 후 함께한 기간은 getAdoptionWeeks로 따로 계산합니다.
export function getUserTree(treeId, saved = [], demoState = null) {
  const tree = getTree(treeId);
  if (!tree) return null;
  const demoWeek = isDemoState(demoState, treeId) ? 39 : tree.startWeek;
  tree.currentWeek = Math.max(tree.startWeek, demoWeek, ...getUserDiaries(treeId, saved).map(diary => diary.week));
  return tree;
}

// 분양 시점부터 지난 주 수(분양 당일 0)입니다. 시연 이력은 가상 날짜이므로 asOf 시점에 고정합니다.
export function getAdoptionWeeks(adoption, treeId, demoState = null, now = Date.now()) {
  if (adoption?.treeId !== treeId) return 0;
  const until = isDemoState(demoState, treeId) && demoState.asOf ? Date.parse(demoState.asOf) : now;
  const weeks = Math.floor((until - Date.parse(adoption.adoptedAt)) / (7 * 24 * 60 * 60 * 1000));
  return Number.isFinite(weeks) ? Math.max(0, weeks) : 0;
}

export function getDiary(treeId, week, diaryId) {
  const sameWeek = getDiaries(treeId).filter((diary) => diary.week === week);
  return diaryId ? sameWeek.find((diary) => diary.id === diaryId) ?? null
    : sameWeek.find((diary) => !diary.isSpecial) ?? sameWeek[0] ?? null;
}

// B 담당 Home/Diary 어댑터의 순수 조회 함수와 반환 상태를 유지합니다.
// 생성 일기는 storage.getGeneratedDiaries() 또는 구독 snapshot에서 명시적으로 전달합니다.
export function getHomeDataForTree(treeId, generatedDiaries = [], demoState = null) {
  const tree = getUserTree(treeId, generatedDiaries, demoState);
  if (!tree) return { tree: null, diary: null };
  const available = getUserDiaries(treeId, generatedDiaries).filter((diary) => diary.week <= tree.currentWeek);
  const diary = available.filter((item) => !item.isSpecial).at(-1) ?? available.at(-1) ?? null;
  return { tree, diary };
}

// 타임라인과 동일한 주차→월 기준. 최근 일기의 계절로 현재 시점을 추정하지 않습니다.
export function seasonOfWeek(week) {
  const month = Math.min(12, Math.floor(((week - 1) * 7) / 30.44) + 1);
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function getDiaryModel({ treeId, generatedDiaries = [], demoState = null } = {}, week, diaryId) {
  const tree = getUserTree(treeId, generatedDiaries, demoState);
  if (!tree) return { status: "no-tree" };
  if (!weekNumber(week)) return { status: "missing", tree };
  const available = getUserDiaries(treeId, generatedDiaries).filter((diary) => diary.week <= tree.currentWeek);
  const previousDiary = available.filter((diary) => !diary.isSpecial && diary.week < week).at(-1) ?? null;
  if (week > tree.currentWeek) return { status: "future", tree, previousDiary };
  const sameWeek = available.filter((diary) => diary.week === week);
  const diary = diaryId ? sameWeek.find((item) => item.id === diaryId)
    : sameWeek.find((item) => !item.isSpecial) ?? sameWeek[0];
  if (!diary) return { status: "missing", tree, previousDiary };
  const weeks = [...new Set(available.filter((item) => !item.isSpecial).map((item) => item.week))]
    .sort((a, b) => a - b);
  return {
    status: "ready", tree, diary,
    previousWeek: weeks.filter((value) => value < week).at(-1) ?? null,
    nextWeek: weeks.find((value) => value > week) ?? null,
    related: sameWeek.filter((item) => item.id !== diary.id),
  };
}

// 수확 1~2주 전이라는 시기 표현입니다. AI 판정이 아니므로 evidence.growthStage를 바꾸지 않습니다.
export function getPlannedStage(tree, week = tree?.currentWeek) {
  const weeksLeft = tree?.harvestWeek - week;
  return weeksLeft >= 1 && weeksLeft <= 2 ? HARVEST_SOON_STAGE : null;
}

// 화면에 표시할 단계입니다. 게시용 보정 → 시기 표현 → AI 판정 순이며 판단할 수 없으면 null입니다.
export function getDiaryStage(diary, tree) {
  const stage = diary.displayStage ?? getPlannedStage(tree, diary.week) ?? diary.evidence.growthStage;
  return stage === HARVEST_SOON_STAGE || Object.hasOwn(STAGE_DESCRIPTIONS, stage) ? stage : null;
}

// 표시 단계가 AI 판정 원본과 다르면 근거 화면에서 둘을 구분해 보여 줍니다.
export function isStageAdjusted(diary, tree) {
  const stage = getDiaryStage(diary, tree);
  return stage !== null && stage !== diary.evidence.growthStage;
}

export function getDiaryHref(diary) {
  if (!isDiary(diary)) return null;
  return `/diary/${diary.week}${diary.isSpecial ? `?id=${encodeURIComponent(diary.id)}` : ""}`;
}
