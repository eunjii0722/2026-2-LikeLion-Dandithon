import { isDiary } from "../../lib/data.js";
import * as storage from "../../lib/storage.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const INITIAL_WORKFLOW = {
  vision: null, diary: null, busy: null, visionError: "", diaryError: "", saveResult: null,
};

export function photoToVisionPayload(photo) {
  const prefix = "data:image/jpeg;base64,";
  if (photo?.mimeType !== "image/jpeg" || !photo.dataUrl?.startsWith(prefix)) {
    throw new Error("JPEG 사진을 선택해 주세요.");
  }
  const imageBase64 = photo.dataUrl.slice(prefix.length);
  if (!imageBase64 || imageBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new Error("사진 데이터가 올바르지 않습니다. 다시 선택해 주세요.");
  }
  const size = imageBase64.length / 4 * 3 - (imageBase64.endsWith("==") ? 2 : imageBase64.endsWith("=") ? 1 : 0);
  if (size > MAX_IMAGE_BYTES) throw new Error("변환한 사진은 4MB 이하여야 합니다. 다른 사진을 선택해 주세요.");
  return { imageBase64, mimeType: photo.mimeType };
}

export function isVision(value) {
  const strings = (items) => Array.isArray(items) && items.every((item) => typeof item === "string");
  return value != null && typeof value === "object"
    && ["휴면", "개화", "착과", "비대", "착색", "수확기", "판단 불가"].includes(value.growth_stage)
    && [true, false, null].includes(value.flowers_visible)
    && [true, false, null].includes(value.fruit_visible)
    && [null, "초록", "일부 붉음", "대부분 붉음"].includes(value.fruit_color)
    && ["높음", "보통", "낮음"].includes(value.confidence)
    && strings(value.observations) && strings(value.uncertain_points);
}

export function createDiaryRequest(input, vision, weatherResult, letters) {
  const { treeId, week, photoType, observedAt, farmerNote, farmerConfirmed } = input;
  if (!treeId || !Number.isInteger(week) || week < 1 || week > 53
    || !["tree", "orchard"].includes(photoType) || typeof farmerNote !== "string"
    || typeof farmerConfirmed !== "boolean" || !/^\d{4}-\d{2}-\d{2}$/.test(observedAt)
    || !Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString().slice(0, 10) !== observedAt) {
    throw new Error("주차, 사진 종류와 관찰 날짜를 확인해 주세요.");
  }
  if (!isVision(vision)) throw new Error("사진을 먼저 분석해 주세요.");
  if (!weatherResult) throw new Error("선택한 관찰 날짜의 날씨 조회가 끝날 때까지 기다려 주세요.");
  // 부분 자료는 표시 전용입니다. weather: null을 그대로 보내며 숫자를 보충하지 않습니다.
  const { weather } = weatherResult;
  if (weather !== null && (!weather || !["tempMax", "tempMin", "rainMm"].every((key) => Number.isFinite(weather[key]))
    || weather.tempMax < weather.tempMin || weather.rainMm < 0)) {
    throw new Error("날씨 조회 결과가 올바르지 않습니다. 관찰 날짜를 다시 선택해 주세요.");
  }
  const includedLetters = letters.filter((letter) => letter.treeId === treeId
    && letter.usedInDiaryId == null && letter.week <= week);
  return {
    payload: { treeId, week, photoType, vision, weather, farmerNote, farmerConfirmed, observedAt,
      letters: includedLetters.map((letter) => letter.text) },
    letterIds: includedLetters.map((letter) => letter.id),
  };
}

function matchesRequest(diary, input) {
  const evidence = diary?.evidence;
  return isDiary(diary) && diary.id === `${input.treeId}-w${input.week}`
    && diary.treeId === input.treeId && diary.week === input.week && diary.photo.type === input.photoType
    && evidence.growthStage === input.vision.growth_stage && evidence.confidence === input.vision.confidence
    && evidence.farmerConfirmed === input.farmerConfirmed && evidence.observedAt === input.observedAt
    && evidence.farmerNote === input.farmerNote
    && (input.weather === null ? evidence.weather === null : evidence.weather !== null
      && ["tempMax", "tempMin", "rainMm"].every((key) => evidence.weather[key] === input.weather[key]));
}

// 생성과 저장을 구분합니다. 사진 없는 저장도 실패하면 편지를 사용 처리하지 않습니다.
export function saveDiary(diary, letterIds, store = storage) {
  let candidate = diary;
  let saved = store.addGeneratedDiary(candidate);
  if (!saved && candidate.photo.url) {
    candidate = { ...diary, photo: { ...diary.photo, url: null } };
    saved = store.addGeneratedDiary(candidate);
  }
  if (!saved) return { saved: false, diary, withoutPhoto: false, unmarked: letterIds };
  const stored = store.getGeneratedDiaries(diary.treeId).find((item) => item.id === diary.id);
  if (JSON.stringify(stored) !== JSON.stringify(candidate)) {
    return { saved: false, diary, withoutPhoto: false, unmarked: letterIds };
  }
  const unmarked = letterIds.filter((id) => !store.markLetterUsed(id, diary.id));
  return { saved: true, diary: candidate, withoutPhoto: Boolean(diary.photo.url && !candidate.photo.url), unmarked };
}

// React 밖에서 요청 생명주기를 관리해, 같은 이벤트 안의 연속 클릭도 차단합니다.
// 취소는 요청 토큰도 폐기하므로 AbortSignal을 무시하는 늦은 응답 역시 저장되지 않습니다.
export function createFarmerWorkflow({ treeId, onChange, fetcher = (...args) => fetch(...args),
  store = storage, timeoutMs = 60_000 }) {
  let state = { ...INITIAL_WORKFLOW };
  let active = null;
  let analyzedPhoto = null;
  let letterIds = [];
  const update = (changes) => { state = { ...state, ...changes }; onChange(state); };
  const currentTree = () => store.getSelectedTreeId() === treeId;
  const current = (job) => active === job && currentTree();
  function cancel() {
    if (active) { clearTimeout(active.timer); active.controller.abort(); }
    active = null;
  }
  function invalidate(analysis = false) {
    // 메모·날짜 변경은 사진 자체의 관찰을 바꾸지 않지만 진행 중 일기는 폐기합니다.
    if (analysis || state.busy === "diary") cancel();
    letterIds = [];
    if (analysis) analyzedPhoto = null;
    update({ diary: null, diaryError: "", saveResult: null,
      ...(analysis ? { vision: null, visionError: "", busy: null } : state.busy === "diary" ? { busy: null } : {}) });
  }
  async function post(url, payload, job) {
    const timeout = new Promise((_, reject) => {
      job.timer = setTimeout(() => {
        job.controller.abort();
        reject(new Error("요청 시간이 초과되었습니다. 다시 시도해 주세요."));
      }, timeoutMs);
    });
    const request = async () => {
      let response;
      try {
        response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload), signal: job.controller.signal });
      } catch {
        throw new Error("서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
      }
      let data;
      try { data = await response.json(); }
      catch { throw new Error("서버 응답을 읽지 못했습니다. 다시 시도해 주세요."); }
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "요청에 실패했습니다. 다시 시도해 주세요.");
      return data;
    };
    try { return await Promise.race([request(), timeout]); }
    finally { clearTimeout(job.timer); }
  }
  function persist() {
    if (!state.diary || state.busy || !currentTree()) return;
    // 저장 성공 후 편지 표시만 실패했다면, 일기를 다시 덮어쓰지 않고 표시만 재시도합니다.
    if (state.saveResult?.saved) {
      const stored = store.getGeneratedDiaries(treeId).find((item) => item.id === state.diary.id);
      if (JSON.stringify(stored) !== JSON.stringify(state.diary)) {
        update({ diaryError: "저장된 일기가 변경되었습니다. 편지 반영 상태를 확인해 주세요." });
        return;
      }
      const unmarked = state.saveResult.unmarked.filter((id) => !store.markLetterUsed(id, state.diary.id));
      update({ saveResult: { ...state.saveResult, unmarked }, diaryError: "" });
      return;
    }
    const result = saveDiary(state.diary, letterIds, store);
    update({ diary: result.diary, saveResult: result, diaryError: "" });
  }
  async function analyze(photo) {
    if (state.busy || !currentTree()) return;
    invalidate(true);
    const job = { controller: new AbortController() };
    active = job;
    update({ busy: "vision" });
    try {
      const result = await post("/api/vision", photoToVisionPayload(photo), job);
      if (!current(job)) return;
      if (!isVision(result)) throw new Error("사진 분석 결과 형식이 올바르지 않습니다. 다시 분석해 주세요.");
      analyzedPhoto = photo;
      update({ vision: result });
    } catch (error) {
      if (current(job)) update({ visionError: error.message });
    } finally {
      if (active === job) { active = null; update({ busy: null }); }
    }
  }
  async function generate(input, weatherResult) {
    if (state.busy || !currentTree() || input.treeId !== treeId) return;
    const job = { controller: new AbortController() };
    active = job;
    update({ busy: "diary", diary: null, saveResult: null, diaryError: "" });
    try {
      const request = createDiaryRequest(input, state.vision, weatherResult, store.getLetters(treeId));
      const result = await post("/api/diary", request.payload, job);
      if (!current(job)) return;
      if (!matchesRequest(result, request.payload)) throw new Error("생성된 일기가 요청 정보와 맞지 않습니다. 다시 시도해 주세요.");
      letterIds = request.letterIds;
      update({ diary: { ...result, photo: { ...result.photo, url: analyzedPhoto.dataUrl } }, busy: null });
      persist();
    } catch (error) {
      if (current(job)) update({ diaryError: error.message });
    } finally {
      if (active === job) { active = null; update({ busy: null }); }
    }
  }
  return { analyze, generate, invalidate, persist,
    dispose() { cancel(); analyzedPhoto = null; letterIds = []; update({ ...INITIAL_WORKFLOW }); } };
}
