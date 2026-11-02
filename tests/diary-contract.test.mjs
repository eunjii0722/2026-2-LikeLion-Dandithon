// /api/diary 계약의 회귀 검사입니다. 실제 route를 실행하되 Gemini 호출만 대역으로 바꿉니다.
// 모델이 프롬프트를 실제로 지키는지는 이 테스트로 확인할 수 없습니다.
import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, test } from "node:test";
import { isDiary, mergeDiaries } from "../lib/data.js";
import { DIARY_PROMPT } from "../lib/prompts/diary.js";

const fakeGemini = `
export class GeminiError extends Error {}
export async function generateTreeDiary(input) {
  globalThis.diaryInputs.push(input);
  return { title: "생성 제목", text: "생성 본문이 마이 고맙다.", dialectWords: [{ word: "마이", meaning: "많이" }] };
}
`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier !== "@/lib/gemini") return nextResolve(specifier, context);
  return { shortCircuit: true, url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(fakeGemini)}`)} };
}
`)}`);
const { POST } = await import("../app/api/diary/route.js");

const validBody = (over = {}) => ({
  treeId: "tree-1", week: 18, photoType: "tree",
  vision: { growth_stage: "개화", confidence: "높음", observations: ["하얀 꽃이 보입니다."] },
  weather: { tempMax: 20, tempMin: 10, rainMm: 0 },
  farmerNote: "", farmerConfirmed: true, observedAt: "2026-05-02", letters: [],
  ...over,
});
async function post(body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const response = await POST(new Request("http://localhost/api/diary", { method: "POST", body: payload }));
  return { status: response.status, json: await response.json() };
}
async function assertRejected(body, label) {
  const { status, json } = await post(body);
  assert.equal(status, 400, label);
  assert.equal(typeof json.error, "string", label);
  assert.deepEqual(globalThis.diaryInputs, [], `${label}: Gemini must not be called`);
}

beforeEach(() => { globalThis.diaryInputs = []; });

test("weather: null is accepted, reaches the model as null and is stored as null", async () => {
  const { status, json } = await post(validBody({ weather: null }));
  assert.equal(status, 200);
  assert.equal(globalThis.diaryInputs[0].weather, null);
  assert.equal(json.evidence.weather, null);
  assert.deepEqual(Object.keys(json), ["id", "treeId", "week", "season", "title", "text", "isSpecial", "dialectWords", "photo", "evidence"]);
  assert.equal(isDiary(json), true);
  assert.equal(mergeDiaries("tree-1", [json]).find((diary) => diary.id === json.id).title, "생성 제목");
});

test("a valid weather object reaches the model and evidence unchanged", async () => {
  for (const weather of [{ tempMax: 20, tempMin: 10, rainMm: 0 }, { tempMax: 16.5, tempMin: -1.2, rainMm: 3.5 },
    { tempMax: 10, tempMin: 10, rainMm: 0 }, { tempMax: -2, tempMin: -8, rainMm: 0.1 }]) {
    globalThis.diaryInputs = [];
    const { status, json } = await post(validBody({ weather }));
    assert.equal(status, 200, JSON.stringify(weather));
    assert.deepEqual(globalThis.diaryInputs[0].weather, weather);
    assert.deepEqual(json.evidence.weather, weather);
    assert.equal(isDiary(json), true, JSON.stringify(weather));
  }
});

test("invalid weather is rejected instead of silently becoming null", async () => {
  for (const weather of [
    { tempMax: 5, tempMin: 10, rainMm: 0 }, { tempMax: 20, tempMin: 10, rainMm: -0.1 },
    { tempMax: "20", tempMin: 10, rainMm: 0 }, { tempMax: 20, tempMin: "10", rainMm: 0 }, { tempMax: 20, tempMin: 10, rainMm: "0" },
    { tempMax: null, tempMin: 10, rainMm: 0 }, { tempMax: 20, tempMin: null, rainMm: 0 }, { tempMax: 20, tempMin: 10, rainMm: null },
    { tempMax: 20, tempMin: 10 }, { tempMin: 10, rainMm: 0 }, { tempMax: 20, rainMm: 0 }, {},
    [], [20, 10, 0], "맑음", "", 0, 1, true, false,
  ]) await assertRejected(validBody({ weather }), JSON.stringify(weather));

  // JSON.parse는 1e999를 Infinity로 읽습니다.
  const body = JSON.stringify(validBody());
  for (const raw of [body.replace('"tempMax":20', '"tempMax":1e999'), body.replace('"tempMin":10', '"tempMin":-1e999'),
    body.replace('"rainMm":0', '"rainMm":1e999')]) await assertRejected(raw, raw);

  const { weather, ...withoutWeather } = validBody();
  assert.ok(weather);
  await assertRejected(withoutWeather, "omitted weather stays a missing required field");
});

test("week follows the common 1~53 contract", async () => {
  for (const week of [1, 53]) {
    const { status, json } = await post(validBody({ week }));
    assert.equal(status, 200, String(week));
    assert.equal(json.id, `tree-1-w${week}`);
    assert.equal(isDiary(json), true, String(week));
  }
  globalThis.diaryInputs = [];
  for (const week of [0, -1, 54, 1.5, "18", null, Number.MAX_SAFE_INTEGER]) await assertRejected(validBody({ week }), String(week));
});

test("missing or malformed required input is rejected without calling Gemini", async () => {
  for (const key of Object.keys(validBody())) {
    const body = validBody();
    delete body[key];
    await assertRejected(body, `missing ${key}`);
  }
  for (const body of ["{broken", "[]", "null", "12"]) await assertRejected(body, body);
  for (const over of [{ treeId: " " }, { photoType: "other" }, { vision: { growth_stage: "개화" } }, { farmerNote: null },
    { farmerConfirmed: "true" }, { observedAt: "2026-02-30" }, { letters: [1] }]) {
    await assertRejected(validBody(over), JSON.stringify(over));
  }
});

test("every accepted combination without weather produces a diary the common store accepts", async () => {
  for (const growth_stage of ["휴면", "개화", "착과", "비대", "착색", "수확기", "판단 불가"]) {
    for (const [photoType, farmerConfirmed] of [["tree", true], ["orchard", false]]) {
      const { status, json } = await post(validBody({ weather: null, photoType, farmerConfirmed, farmerNote: "메모",
        vision: { growth_stage, confidence: "낮음", flowers_visible: null, uncertain_points: ["불분명함"] } }));
      assert.equal(status, 200, growth_stage);
      assert.equal(isDiary(json), true, growth_stage);
    }
  }
});

test("the prompt treats null weather as unknown and keeps the rules for real weather", () => {
  assert.match(DIARY_PROMPT, /weather가 null이면 날씨를 모르는 상태/u);
  for (const word of ["기온", "강수", "비가 오지 않았다", "맑음", "흐림", "햇살"]) {
    assert.match(DIARY_PROMPT.slice(DIARY_PROMPT.indexOf("weather가 null이면")).split("\n").slice(0, 3).join(" "), new RegExp(word, "u"), word);
  }
  assert.match(DIARY_PROMPT, /tempMax는 최고기온\(℃\), tempMin은 최저기온\(℃\), rainMm은 강수량\(mm\)/u);
  assert.match(DIARY_PROMPT, /비는 기록되지 않았다/u);
});
