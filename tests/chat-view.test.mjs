// /chat 화면이 /api/chat에 보내는 요청의 회귀 검사입니다. 실제 저장소·route를 실행하되 Gemini 호출만 대역으로 바꿉니다.
// 모델이 일기를 실제로 어떻게 답변에 쓰는지는 이 테스트로 확인할 수 없습니다.
import assert from "node:assert/strict";
import { register } from "node:module";
import { after, afterEach, beforeEach, test } from "node:test";
import { getDiary, isDemoDiary } from "../lib/data.js";
import { formatChatResponse, parseChatPayload } from "../lib/chat-contract.mjs";
import { getAllDiaries, getDemoState } from "../lib/storage.js";
import { requestChat, toChatDiaries, visibleDiaries } from "../components/chat/chatApi.js";

const fakeGemini = `
export class ChatServiceError extends Error {}
export async function answerTreeQuestion(payload) {
  globalThis.chatPayloads.push(payload);
  return { answer: "답변", source: null };
}
`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript," };
  if (specifier === "@/lib/gemini-chat.js") return { shortCircuit: true, url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(fakeGemini)}`)} };
  if (specifier.startsWith("@/")) return nextResolve(new URL(specifier.slice(2), ${JSON.stringify(new URL("../", import.meta.url).href)}).href, context);
  return nextResolve(specifier, context);
}
`)}`);
const { POST } = await import("../app/api/chat/route.js");
const { resolveWeatherIntent, safeWeatherAnswer } = await import("../lib/chat-weather.js");

const CURRENT_WEEK = 18;
const PHOTO = `data:image/jpeg;base64,${"A".repeat(200_000)}`;
// This suite deliberately uses week 18 to keep testing future-diary filtering.
const STATIC_IDS = ["tree-1-w18"];
const realFetch = globalThis.fetch;

const generated = (over = {}) => ({
  ...getDiary("tree-1", 18),
  id: "tree-1-w17", week: 17, title: "생성 일기", text: "생성 본문이에요.", ...over,
});
function seedGenerated(diaries) {
  const stored = new Map([["generatedDiaries", JSON.stringify(diaries)]]);
  globalThis.window = {
    localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
  };
}
// 화면과 같은 경로로 요청 본문을 만듭니다.
async function sentBody({ messages = [], diaries = toChatDiaries(getAllDiaries("tree-1"), CURRENT_WEEK,
  new Set(getAllDiaries("tree-1").filter((diary) => isDemoDiary(diary, getDemoState())).map((diary) => diary.id))) } = {}) {
  let body;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/chat");
    body = init.body;
    return Response.json({ answer: "답변", source: null });
  };
  await requestChat({ treeId: "tree-1", question: "질문", messages, recentDiaries: diaries });
  return body;
}

beforeEach(() => {
  globalThis.chatPayloads = [];
  seedGenerated([]);
});
afterEach(() => { globalThis.fetch = realFetch; });
after(() => { delete globalThis.window; });

test("history reads content, text and message fields and maps tree to assistant", async () => {
  const body = JSON.parse(await sentBody({ messages: [
    { role: "user", content: "content 필드" }, { role: "tree", text: "text 필드" }, { role: "user", message: "message 필드" },
    { role: "tree", message: "나무의 message 필드" },
  ] }));
  const expected = [
    { role: "user", content: "content 필드" }, { role: "assistant", content: "text 필드" },
    { role: "user", content: "message 필드" }, { role: "assistant", content: "나무의 message 필드" },
  ];
  assert.deepEqual(body.history, expected);
  assert.deepEqual(parseChatPayload(body).value.history, expected, "the server must keep every entry");
});

test("history keeps the existing field priority and the last 10 messages", async () => {
  const priority = JSON.parse(await sentBody({ messages: [{ role: "user", content: "1", text: "2", message: "3" }, { role: "user", text: "2", message: "3" }] }));
  assert.deepEqual(priority.history.map((item) => item.content), ["1", "2"]);
  const messages = Array.from({ length: 12 }, (_, index) => ({ role: "user", text: `m${index}` }));
  const recent = JSON.parse(await sentBody({ messages }));
  assert.deepEqual(recent.history.map((item) => item.content), messages.slice(-10).map((item) => item.text));
});

test("new users never send static demo diaries to the API", async () => {
  const { recentDiaries } = JSON.parse(await sentBody());
  assert.deepEqual(recentDiaries.map((diary) => diary.id), []);
  for (const diary of recentDiaries) assert.deepEqual(Object.keys(diary), ["id", "treeId", "week", "title", "text", "recordKind", "observedAt", "weather"]);
  assert.deepEqual(parseChatPayload(JSON.parse(await sentBody())).value.recentDiaries.map((diary) => diary.id), []);
});

test("generated diaries are sent together with static ones, in week order", async () => {
  seedGenerated([generated(), generated({ id: "tree-1-w18", week: 18, title: "교체된 18주차" })]);
  const { recentDiaries } = JSON.parse(await sentBody());
  assert.deepEqual(recentDiaries.map((diary) => [diary.id, diary.week]), [
    ["tree-1-w17", 17], ["tree-1-w18", 18],
  ]);
  assert.equal(recentDiaries.find((diary) => diary.id === "tree-1-w18").title, "교체된 18주차");
});

test("future weeks and other trees never reach the API", async () => {
  seedGenerated([
    generated({ id: "tree-1-w19", week: 19, text: "미래 기록" }),
    generated({ id: "tree-1-w41", week: 41, text: "미래 기록" }),
    generated({ id: "tree-2-w10", treeId: "tree-2", week: 10, text: "다른 나무 기록" }),
    generated({ id: "tree-1-w18", week: 18, title: "현재 주차 경계" }),
  ]);
  const raw = await sentBody();
  assert.deepEqual(JSON.parse(raw).recentDiaries.map((diary) => diary.id), STATIC_IDS);
  assert.ok(!raw.includes("미래 기록") && !raw.includes("다른 나무 기록"));
  assert.ok(raw.includes("현재 주차 경계"), "the current week itself is included");
});

test("visible diaries stop at the current week for the stage icon too", () => {
  const diaries = [{ week: 17 }, { week: 18 }, { week: 19 }];
  assert.deepEqual(visibleDiaries(diaries, 18), [{ week: 17 }, { week: 18 }]);
  assert.deepEqual(visibleDiaries([], 18), []);
});

test("photos and private farmer notes are not sent, while diary weather remains available", async () => {
  seedGenerated([generated({ photo: { url: PHOTO, type: "tree" } })]);
  const raw = await sentBody();
  for (const text of ["base64", "data:image", "photo", "evidence", "farmerNote", "dialectWords"]) {
    assert.ok(!raw.includes(text), text);
  }
  const diary = JSON.parse(raw).recentDiaries.find((item) => item.id === "tree-1-w17");
  assert.equal(diary.recordKind, "generated");
  assert.equal(diary.observedAt, "2026-05-02");
  assert.equal(diary.weather, null);
  const post = (body) => POST(new Request("http://localhost/api/chat", { method: "POST", body }));
  const response = await post(raw);
  assert.equal(response.status, 200);
  assert.ok(globalThis.chatPayloads[0].recentDiaries.some((diary) => diary.id === "tree-1-w17"));

  // 수정 전처럼 일기 전체를 보내면 서버 본문 한도(128KB)에 걸립니다.
  const full = JSON.stringify({ treeId: "tree-1", question: "질문", recentDiaries: getAllDiaries("tree-1") });
  assert.equal((await post(full)).status, 413);
});

test("chat sends dated recorded weather and marks generated versus demo diaries", async () => {
  const diary = generated({ evidence: { ...getDiary("tree-1", 21).evidence,
    observedAt: "2026-09-26", weather: { tempMax: 24.5, tempMin: 16, rainMm: 0.1 } } });
  seedGenerated([diary]);
  const sent = toChatDiaries([diary, getDiary("tree-1", 18)], CURRENT_WEEK, new Set(["tree-1-w18"]));
  const { value } = parseChatPayload({ treeId: "tree-1", question: "날씨", recentDiaries: sent });
  assert.deepEqual(value.recentDiaries[0].weather, { tempMax: 24.5, tempMin: 16, rainMm: 0.1 });
  assert.equal(value.recentDiaries[0].observedAt, "2026-09-26");
  assert.equal(value.recentDiaries[0].recordKind, "generated");
  assert.equal(formatChatResponse({ answer: "기록에 있데이", sourceId: diary.id }, value.recentDiaries).source,
    "AI 생성 성장일기 · 17주차 · 생성 일기");
  assert.equal(value.recentDiaries[1].recordKind, "demo");
});

test("the newest diaries survive when there are more than the API uses", () => {
  const many = Array.from({ length: 40 }, (_, index) => generated({ id: `d${index}`, week: index + 1 }));
  const shuffled = [...many].reverse();
  const sent = toChatDiaries(shuffled, 53);
  assert.deepEqual(sent.map((diary) => diary.week), many.slice(-30).map((diary) => diary.week));
  assert.deepEqual(parseChatPayload({ treeId: "tree-1", question: "질문", recentDiaries: sent }).value.recentDiaries.map((diary) => diary.week),
    sent.map((diary) => diary.week));
});

test("a source can only name a diary that was actually sent", async () => {
  seedGenerated([getDiary("tree-1", 18), generated({ id: "tree-1-w20", week: 20 })]);
  const { value } = parseChatPayload(JSON.parse(await sentBody()));
  assert.deepEqual(formatChatResponse({ answer: "답", sourceId: "tree-1-w18" }, value.recentDiaries),
    { answer: "답", source: `AI 생성 성장일기 · 18주차 · ${getDiary("tree-1", 18).title}` });
  assert.throws(() => formatChatResponse({ answer: "답", sourceId: "tree-1-w20" }, value.recentDiaries));
});

test("a dated weather question sends measured ASOS data to Gemini and labels the source", async () => {
  const key = "TEST-KEY";
  process.env.KMA_ASOS_SERVICE_KEY = key;
  globalThis.fetch = async (url) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("stnIds"), "276");
    assert.equal(query.get("startDt"), "20260926");
    return Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: {
      tm: "2026-09-26", stnId: "276", stnNm: "청송군", maxTa: "24.5", minTa: "16", sumRn: "0.1",
    } } } } });
  };
  try {
    const response = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({
      treeId: "tree-1", question: "2026년 9월 26일 날씨 어땠어?", recentDiaries: [],
    }) }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(body.answer, /24\.5°C.*16°C.*0\.1mm/u);
    assert.equal(body.source, "기상청 ASOS · 청송군 · 2026-09-26 일자료");
    assert.deepEqual(globalThis.chatPayloads[0].weatherContext.observations[0].weather,
      { tempMax: 24.5, tempMin: 16, rainMm: 0.1 });
    assert.equal(globalThis.chatPayloads[0].weatherContext.observations[0].source.stationId, "276");
  } finally { delete process.env.KMA_ASOS_SERVICE_KEY; }
});

test("unpublished dates and missing ASOS keys never invent values", async () => {
  delete process.env.KMA_ASOS_SERVICE_KEY;
  const post = async (question) => POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ treeId: "tree-1", question }) }));
  const unpublished = await post("2099-01-01 날씨는?");
  assert.equal(unpublished.status, 200);
  assert.match((await unpublished.json()).source, /^조회 상태 · 기상청 ASOS/u);
  const missingKey = await post("2026-09-26 기온은?");
  assert.equal(missingKey.status, 503);
  assert.match((await missingKey.json()).error, /설정되지/u);
  process.env.KMA_ASOS_SERVICE_KEY = "TEST-KEY";
  globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "20" } } });
  try {
    const auth = await post("2026-09-26 강수량은?");
    assert.equal(auth.status, 502);
    assert.deepEqual(await auth.json(), { error: "기상청 인증에 실패했어요.", errorType: "weather" });
  } finally { delete process.env.KMA_ASOS_SERVICE_KEY; }
});

test("recent, yesterday follow-up, today, and last-week questions resolve in Korea time", async () => {
  const now = new Date("2026-11-09T04:15:00Z"); // Monday 13:15 KST
  assert.deepEqual(resolveWeatherIntent("요즘 날씨 어땠어?", [], now).dates, ["2026-11-08"]);
  assert.deepEqual(resolveWeatherIntent("지난주 청송 날씨 어땠어?", [], now).dates,
    ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  assert.deepEqual(resolveWeatherIntent("어제는?", [{ role: "user", content: "요즘 날씨 어땠어?" }], now).dates,
    ["2026-11-08"]);
  assert.equal(resolveWeatherIntent("어제는?", [{ role: "user", content: "꽃이 폈어?" }], now), null);
  assert.equal(resolveWeatherIntent("오늘 날씨는 어때?", [], now).kind, "today");
  assert.equal(resolveWeatherIntent("홍이는 꽃이 폈어?", [], now), null);
  assert.equal(resolveWeatherIntent("18주차 일기에 적힌 날씨는?", [], now), null);
  assert.deepEqual(resolveWeatherIntent("요즘 날씨", [], new Date("2026-11-09T00:00:00Z")).dates,
    ["2026-11-07"], "before 11:00 KST, yesterday's daily record is not yet published");
});

test("yesterday follow-up receives dated ASOS data, while today never requests a live forecast", async () => {
  process.env.KMA_ASOS_SERVICE_KEY = "TEST-KEY";
  const expectedYesterday = resolveWeatherIntent("어제 날씨").dates[0];
  const called = [];
  globalThis.fetch = async (url) => {
    const date = new URL(url).searchParams.get("startDt");
    called.push(date);
    return Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: {
      tm: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`,
      stnId: "276", stnNm: "청송군", maxTa: "19", minTa: "7", sumRn: "0",
    } } } } });
  };
  const post = async (question, history = []) => POST(new Request("http://localhost/api/chat", {
    method: "POST", body: JSON.stringify({ treeId: "tree-1", question, history }),
  }));
  try {
    const yesterday = await post("어제는?", [
      { role: "user", content: "요즘 날씨 어땠어?" }, { role: "assistant", content: "기록을 봤데이." },
    ]);
    assert.equal(yesterday.status, 200);
    assert.match((await yesterday.json()).source, new RegExp(expectedYesterday));
    assert.equal(globalThis.chatPayloads[0].weatherContext.kind, "yesterday");
    assert.equal(called.length, 1);

    const today = await post("오늘 날씨는 어때?");
    assert.equal(today.status, 200);
    const todayBody = await today.json();
    assert.match(todayBody.answer, /현재 날씨나 예보는 아직 받지 못했/u);
    assert.match(todayBody.source, /^조회 상태 · /u);
    assert.equal(globalThis.chatPayloads[1].weatherContext.kind, "today");
    assert.equal(called.length, 1, "ASOS daily data cannot provide today's live weather");
  } finally { delete process.env.KMA_ASOS_SERVICE_KEY; }
});

test("flower questions keep diary-based Gemini chat without querying ASOS", async () => {
  globalThis.fetch = async () => { throw new Error("ASOS must not be called"); };
  const response = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({
    treeId: "tree-1", question: "홍이는 꽃이 폈어?", recentDiaries: [{ id: "tree-1-w18", text: "꽃이 보였어." }],
  }) }));
  assert.equal(response.status, 200);
  assert.equal(globalThis.chatPayloads[0].weatherContext, null);
  assert.equal(globalThis.chatPayloads[0].recentDiaries[0].id, "tree-1-w18");
});

test("last-week chat sends only complete measured days and identifies missing rainfall", async () => {
  process.env.KMA_ASOS_SERVICE_KEY = "TEST-KEY";
  const intent = resolveWeatherIntent("지난주 청송 날씨 어땠어?");
  const expected = intent.dates;
  const availableDays = expected.filter((date) => date <= intent.published);
  const measuredCount = availableDays.length - 1;
  const requested = [];
  globalThis.fetch = async (url) => {
    const day = new URL(url).searchParams.get("startDt");
    requested.push(day);
    return Response.json({ response: { header: { resultCode: "00" }, body: { items: { item: {
      tm: `${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6)}`,
      stnId: "276", stnNm: "청송군", maxTa: "20", minTa: "7",
      sumRn: day === expected[2].replaceAll("-", "") ? "" : "1.5",
    } } } } });
  };
  try {
    const response = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({
      treeId: "tree-1", question: "지난주 청송 날씨 어땠어?", recentDiaries: [],
    }) }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.source, new RegExp(`기상청 ASOS · 청송군 .*실제 관측 ${measuredCount}/7일`));
    assert.equal(requested.length, availableDays.length);
    const context = globalThis.chatPayloads[0].weatherContext;
    assert.equal(context.observations.length, measuredCount);
    assert.deepEqual(context.unavailable[0], { date: expected[2], reason: "rain_missing", message: "강수량 관측값이 비어 있어요." });
    assert.ok(!JSON.stringify(context.observations).includes('"rainMm":null'));
  } finally { delete process.env.KMA_ASOS_SERVICE_KEY; }
});

test("a Gemini weather number outside ASOS observations is replaced with measured facts", () => {
  const context = { kind: "recent", range: ["2026-11-08"], observations: [{
    date: "2026-11-08", weather: { tempMax: 20, tempMin: 7, rainMm: 1.5 },
  }], unavailable: [] };
  assert.match(safeWeatherAnswer("최고 99°C였다 카더라.", context), /최고 20°C, 최저 7°C, 강수량 1\.5mm/u);
  assert.equal(safeWeatherAnswer("최고 20°C, 최저 7°C, 강수량 1.5mm였데이.", context),
    "최고 20°C, 최저 7°C, 강수량 1.5mm였데이.");
  const missing = { kind: "yesterday", range: ["2026-11-08"], observations: [],
    unavailable: [{ date: "2026-11-08", reason: "no_data", message: "이 날짜의 관측자료가 없어요." }] };
  const answer = safeWeatherAnswer("최고 99°C였데이.", missing);
  assert.doesNotMatch(answer, /99°C/u);
  assert.match(answer, /관측자료가 없/u);
});

test("the route reports server and Gemini timing only in development, without any content", async () => {
  const post = () => POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ treeId: "tree-1", question: "비밀 질문" }) }));
  const realEnv = process.env.NODE_ENV;
  const realDebug = console.debug;
  const logs = [];
  console.debug = (...args) => logs.push(JSON.stringify(args));
  try {
    process.env.NODE_ENV = "development";
    const header = (await post()).headers.get("server-timing");
    assert.match(header, /^total;dur=[\d.]+, gemini;dur=[\d.]+$/);
    assert.ok(logs.length > 0);
    assert.ok(!logs.join().includes("비밀 질문"));
    process.env.NODE_ENV = "production";
    assert.equal((await post()).headers.get("server-timing"), null);
  } finally {
    process.env.NODE_ENV = realEnv;
    console.debug = realDebug;
  }
});

test("requestChat reports API failures so the screen can show its error", async () => {
  const call = () => requestChat({ treeId: "tree-1", question: "질문", messages: [], recentDiaries: [] });
  globalThis.fetch = async () => Response.json({ error: "서버 오류" }, { status: 500 });
  await assert.rejects(call, /서버 오류/u);
  globalThis.fetch = async () => new Response("<html>", { status: 502 });
  await assert.rejects(call, /AI가 답변을 만들지 못했어요/u);
  globalThis.fetch = async () => Response.json({ source: null });
  await assert.rejects(call, /대화 요청에 실패했어요/u);
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(call, /네트워크/u);
});
