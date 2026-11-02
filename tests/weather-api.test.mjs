// /api/weather의 회귀 검사입니다. 실제 route와 lib/weather.js를 실행하되 기상청 호출만 대역으로 바꿉니다.
// 아래 관측값은 파싱 검증용 가짜 값이며 실제 관측자료가 아닙니다. 실제 호출 검증을 대신하지 않습니다.
import assert from "node:assert/strict";
import { register } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { isDiary } from "../lib/data.js";

const fakeGemini = `
export class GeminiError extends Error {}
export async function generateTreeDiary() {
  return { title: "생성 제목", text: "생성 본문이 마이 고맙다.", dialectWords: [{ word: "마이", meaning: "많이" }] };
}
`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript," };
  if (specifier === "@/lib/gemini") return { shortCircuit: true, url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(fakeGemini)}`)} };
  if (specifier.startsWith("@/")) return nextResolve(new URL(specifier.slice(2) + ".js", ${JSON.stringify(new URL("../", import.meta.url).href)}).href, context);
  return nextResolve(specifier, context);
}
`)}`);
const { GET } = await import("../app/api/weather/route.js");
const { POST } = await import("../app/api/diary/route.js");
const { fetchDailyWeather, latestPublishedDate } = await import("../lib/weather.js");

const KEY = "TEST+KEY/secret==";
const DATE = "2025-05-01";
const SOURCE = { provider: "기상청", network: "ASOS", stationId: "276", stationName: "청송군" };
const realFetch = globalThis.fetch;

const item = (over = {}) => ({ stnId: "276", stnNm: "청송군", tm: DATE, maxTa: "21.5", minTa: "8.3", sumRn: "1.5", ...over });
const kma = (items, code = "00") => ({ response: { header: { resultCode: code, resultMsg: "MSG" }, body: { dataType: "JSON", items, pageNo: 1, numOfRows: 10, totalCount: 1 } } });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const gateway = (code, status) => json({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "ERR", returnAuthMsg: "거부", returnReasonCode: code } } }, status);

let calls;
function mockKma(reply) {
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return typeof reply === "function" ? reply(String(url), options) : reply.clone();
  };
}
async function get(query = `date=${DATE}&treeId=tree-1`) {
  const response = await GET(new Request(`http://localhost/api/weather?${query}`));
  return { status: response.status, json: await response.json() };
}
async function assertNoWeather(reply, reason, status, label = reason) {
  calls = [];
  mockKma(reply);
  const result = await get();
  assert.equal(result.json.weather, null, label);
  assert.equal(result.json.reason, reason, label);
  assert.equal(result.status, status, label);
  assert.equal(typeof result.json.message, "string", label);
  const text = JSON.stringify(result.json);
  assert.ok(!text.includes(KEY) && !text.includes(encodeURIComponent(KEY)) && !text.includes("apis.data.go.kr"), `${label}: leaked secret`);
  return result;
}

beforeEach(() => {
  calls = [];
  process.env.KMA_ASOS_SERVICE_KEY = KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.KMA_ASOS_SERVICE_KEY;
});

test("requests station 276 for one day over HTTPS with the documented parameters", async () => {
  mockKma(json(kma({ item: [item()] })));
  const { status, json: body } = await get();
  assert.equal(status, 200);
  assert.deepEqual(body, { date: DATE, weather: { tempMax: 21.5, tempMin: 8.3, rainMm: 1.5 }, reason: null, source: SOURCE });

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    serviceKey: KEY, numOfRows: "10", pageNo: "1", dataType: "JSON", dataCd: "ASOS", dateCd: "DAY",
    startDt: "20250501", endDt: "20250501", stnIds: "276",
  });
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[0].options.redirect, "error");
});

test("an already URL-encoded key is not encoded twice", async () => {
  process.env.KMA_ASOS_SERVICE_KEY = "ABC%2BDEF%3D%3D";
  mockKma(json(kma({ item: [item()] })));
  await get();
  assert.match(calls[0].url, /serviceKey=ABC%2BDEF%3D%3D&/u);
});

test("different dates are requested separately and each returns its own values", async () => {
  mockKma((url) => {
    const day = new URL(url).searchParams.get("startDt");
    const tm = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
    return json(kma({ item: [item({ tm, maxTa: day.slice(6), minTa: "1" })] }));
  });
  const first = await get("date=2025-05-10&treeId=tree-1");
  const second = await get("date=2025-05-20&treeId=tree-1");
  assert.equal(first.json.weather.tempMax, 10);
  assert.equal(second.json.weather.tempMax, 20);
  assert.equal(calls.length, 2);
});

test("negative and decimal temperatures are parsed exactly", async () => {
  for (const [maxTa, minTa, sumRn, expected] of [
    ["-2.1", "-11.5", "0.4", { tempMax: -2.1, tempMin: -11.5, rainMm: 0.4 }],
    ["0", "-0.3", "12", { tempMax: 0, tempMin: -0.3, rainMm: 12 }],
    ["5", "5", "0.0", { tempMax: 5, tempMin: 5, rainMm: 0 }],
    [3.5, -1, 2, { tempMax: 3.5, tempMin: -1, rainMm: 2 }],
  ]) {
    mockKma(json(kma({ item: [item({ maxTa, minTa, sumRn })] })));
    assert.deepEqual((await get()).json.weather, expected);
  }
});

test("0mm is kept as 0 while missing rain never becomes 0", async () => {
  mockKma(json(kma({ item: [item({ sumRn: "0" })] })));
  assert.equal((await get()).json.weather.rainMm, 0);

  const { sumRn, ...withoutRain } = item();
  assert.ok(sumRn);
  await assertNoWeather(json(kma({ item: [withoutRain] })), "rain_missing", 200, "absent sumRn");
  for (const value of ["", "   ", null]) {
    await assertNoWeather(json(kma({ item: [item({ sumRn: value })] })), "rain_missing", 200, JSON.stringify(value));
  }
});

test("blank rain returns the observed temperatures only as partialWeather", async () => {
  const { sumRn, ...withoutRain } = item({ maxTa: "18.7", minTa: "5.7" });
  assert.ok(sumRn);
  for (const row of [item({ maxTa: "18.7", minTa: "5.7", sumRn: "" }), item({ maxTa: "18.7", minTa: "5.7", sumRn: "  " }),
    item({ maxTa: "18.7", minTa: "5.7", sumRn: null }), withoutRain]) {
    mockKma(json(kma({ item: [row] })));
    const { status, json: body } = await get();
    assert.equal(status, 200);
    assert.deepEqual(body, {
      date: DATE, weather: null, partialWeather: { tempMax: 18.7, tempMin: 5.7, rainMm: null },
      reason: "rain_missing", message: "강수량 관측값이 비어 있어요.", source: SOURCE,
    });
  }
  mockKma(json(kma({ item: [item({ maxTa: "-0.5", minTa: "-6.3", sumRn: "" })] })));
  assert.deepEqual((await get()).json.partialWeather, { tempMax: -0.5, tempMin: -6.3, rainMm: null });
});

test("partialWeather appears only when the temperatures are valid and only rain is blank", async () => {
  for (const [row, status, reason] of [
    [item(), 200, null],
    [item({ sumRn: "0.0" }), 200, null],
    [item({ maxTa: "", sumRn: "" }), 200, "temperature_missing"],
    [item({ minTa: "", sumRn: "" }), 200, "temperature_missing"],
    [item({ maxTa: "", sumRn: "1.5" }), 200, "temperature_missing"],
    [item({ maxTa: "abc", sumRn: "" }), 502, "invalid_observation"],
    [item({ minTa: "1e3", sumRn: "" }), 502, "invalid_observation"],
    [item({ maxTa: "5", minTa: "10", sumRn: "" }), 502, "invalid_observation"],
    [item({ maxTa: "9".repeat(400), sumRn: "" }), 502, "invalid_observation"],
    [item({ sumRn: "abc" }), 502, "invalid_observation"],
    [item({ sumRn: "-1" }), 502, "invalid_observation"],
    [item({ tm: "2025-04-30", sumRn: "" }), 502, "observation_mismatch"],
    [item({ stnId: "108", sumRn: "" }), 502, "observation_mismatch"],
  ]) {
    mockKma(json(kma({ item: [row] })));
    const { status: actual, json: body } = await get();
    assert.equal(actual, status, JSON.stringify(row).slice(0, 80));
    assert.equal(body.reason, reason, JSON.stringify(row).slice(0, 80));
    assert.equal(Object.hasOwn(body, "partialWeather"), false, JSON.stringify(row).slice(0, 80));
  }
  mockKma(json({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }));
  assert.equal(Object.hasOwn((await get()).json, "partialWeather"), false);
  mockKma(new Response("Bad Gateway", { status: 502 }));
  assert.equal(Object.hasOwn((await get()).json, "partialWeather"), false);
});

test("a blank-rain result reaches /api/diary as null and partialWeather is rejected there", async () => {
  async function diaryWith(weather) {
    const response = await POST(new Request("http://localhost/api/diary", { method: "POST", body: JSON.stringify({
      treeId: "tree-1", week: 18, photoType: "tree", vision: { growth_stage: "개화", confidence: "높음" },
      weather, farmerNote: "", farmerConfirmed: true, observedAt: DATE, letters: [],
    }) }));
    return { status: response.status, json: await response.json() };
  }
  mockKma(json(kma({ item: [item({ sumRn: "" })] })));
  const { json: result } = await get();
  const diary = await diaryWith(result.weather);
  assert.equal(diary.status, 200);
  assert.equal(diary.json.evidence.weather, null);
  assert.equal(isDiary(diary.json), true);
  assert.equal((await diaryWith(result.partialWeather)).status, 400);
});

test("missing or invalid temperatures and rain give null with a distinct reason", async () => {
  for (const over of [{ maxTa: "" }, { minTa: "" }, { maxTa: null }, { minTa: "  " }]) {
    await assertNoWeather(json(kma({ item: [item(over)] })), "temperature_missing", 200, JSON.stringify(over));
  }
  for (const over of [{ maxTa: "5", minTa: "10" }, { sumRn: "-0.1" }, { maxTa: "abc" }, { minTa: "1e3" }, { sumRn: "--1" },
    { sumRn: "1.2.3" }, { maxTa: "9".repeat(400) }, { sumRn: {} }, { maxTa: "NaN" }, { sumRn: "Infinity" }]) {
    await assertNoWeather(json(kma({ item: [item(over)] })), "invalid_observation", 502, JSON.stringify(over).slice(0, 40));
  }
});

test("a response for another date or station is never used", async () => {
  for (const over of [{ tm: "2025-04-30" }, { tm: "20250501" }, { tm: undefined }, { stnId: "108" }, { stnId: undefined }, { stnNm: "서울" }, { stnNm: undefined }]) {
    await assertNoWeather(json(kma({ item: [item(over)] })), "observation_mismatch", 502, JSON.stringify(over));
  }
  await assertNoWeather(json(kma({ item: [item(), item()] })), "observation_mismatch", 502, "two rows");
  mockKma(json(kma({ item: [item({ stnId: 276 })] })));
  assert.deepEqual((await get()).json.source, SOURCE);
  mockKma(json(kma({ item: item() })));
  assert.equal((await get()).json.weather.tempMax, 21.5);
});

test("dates without data give no_data", async () => {
  await assertNoWeather(json({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }), "no_data", 200, "code 03");
  for (const items of ["", null, {}, { item: [] }]) {
    await assertNoWeather(json(kma(items)), "no_data", 200, JSON.stringify(items));
  }
});

test("every official result code maps to a distinct failure", async () => {
  for (const [code, reason, status] of [
    ["01", "upstream_error", 502], ["02", "upstream_error", 502], ["04", "upstream_error", 502], ["05", "upstream_error", 502],
    ["10", "request_rejected", 502], ["11", "request_rejected", 502], ["12", "upstream_error", 502],
    ["20", "auth_failed", 502], ["21", "auth_failed", 502], ["30", "auth_failed", 502], ["31", "auth_failed", 502], ["32", "auth_failed", 502], ["33", "auth_failed", 502],
    ["22", "rate_limited", 503], ["99", "upstream_error", 502], ["77", "upstream_error", 502],
  ]) {
    const { json: body } = await assertNoWeather(json({ response: { header: { resultCode: code, resultMsg: "ERR" } } }), reason, status, `code ${code}`);
    assert.equal(body.resultCode, code);
  }
});

test("data.go.kr gateway authentication errors are recognized in JSON and XML", async () => {
  // JSON 형식과 401/403 상태는 실제 게이트웨이 응답에서 확인한 값입니다.
  await assertNoWeather(gateway("20", 401), "auth_failed", 502, "missing key gateway");
  await assertNoWeather(gateway("30", 403), "auth_failed", 502, "unregistered key gateway");
  await assertNoWeather(gateway("12", 400), "upstream_error", 502, "unknown service gateway");
  const xml = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>ERR</errMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
  await assertNoWeather(new Response(xml, { status: 200 }), "auth_failed", 502, "xml gateway");
});

test("HTTP errors, network errors and timeouts give null and never leak the request URL", async () => {
  await assertNoWeather(new Response("Bad Gateway", { status: 502 }), "upstream_error", 502, "http 502");
  await assertNoWeather(json(kma({ item: [item()] }), 500), "upstream_error", 502, "http 500 with body");
  await assertNoWeather((url) => { throw new TypeError(`fetch failed ${url}`); }, "upstream_error", 502, "network");
  await assertNoWeather(() => { throw new DOMException("timed out", "TimeoutError"); }, "timeout", 504, "connect timeout");
  await assertNoWeather(() => { throw new DOMException("aborted", "AbortError"); }, "timeout", 504, "abort");
  await assertNoWeather(() => ({
    ok: true, status: 200, text: async () => { throw new DOMException("timed out", "TimeoutError"); },
  }), "timeout", 504, "body timeout");
});

test("the configured timeout really aborts a request that never answers", { timeout: 20_000 }, async () => {
  const realTimeout = AbortSignal.timeout;
  AbortSignal.timeout = () => realTimeout.call(AbortSignal, 20);
  try {
    await assertNoWeather((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
    }), "timeout", 504, "hung request");
  } finally {
    AbortSignal.timeout = realTimeout;
  }
});

test("malformed success responses give invalid_response", async () => {
  for (const body of ["<html>점검 중</html>", "", "not json", "[]", "12", "null", "{}", '{"response":{}}', '{"response":{"header":{}}}']) {
    await assertNoWeather(new Response(body, { status: 200 }), "invalid_response", 502, body || "empty");
  }
  await assertNoWeather(new Response("<response><header><resultCode>00</resultCode></header></response>", { status: 200 }), "invalid_response", 502, "xml success");
  for (const value of [{ response: { header: { resultCode: "00" } } }, kma(12), kma("문자열"), kma([]), kma({ item: ["문자열"] }), kma({ item: [null] }), kma({ item: 5 })]) {
    await assertNoWeather(json(value), "invalid_response", 502, JSON.stringify(value));
  }
});

test("invalid requests are rejected before any KMA call", async () => {
  mockKma(json(kma({ item: [item()] })));
  for (const query of ["treeId=tree-1", "date=&treeId=tree-1", "date=2025-02-30&treeId=tree-1", "date=20250501&treeId=tree-1",
    "date=2025-5-1&treeId=tree-1", "date=abc&treeId=tree-1", `date=${DATE}`, `date=${DATE}&treeId=%20`]) {
    const { status, json: body } = await get(query);
    assert.equal(status, 400, query);
    assert.equal(typeof body.error, "string", query);
  }
  for (const query of [`date=${DATE}&treeId=tree-999`, `date=${DATE}&treeId=__proto__`]) {
    assert.equal((await get(query)).status, 404, query);
  }
  assert.equal(calls.length, 0);
});

test("today and future dates are not requested and never reuse another day", async () => {
  mockKma(json(kma({ item: [item()] })));
  const kstToday = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  for (const date of [kstToday, "2999-01-01"]) {
    const { status, json: body } = await get(`date=${date}&treeId=tree-1`);
    assert.equal(status, 200, date);
    assert.equal(body.weather, null, date);
    assert.equal(body.reason, "not_yet_available", date);
    assert.equal(body.date, date);
  }
  assert.equal(calls.length, 0);
});

test("yesterday becomes available at 11:00 KST", async () => {
  assert.equal(latestPublishedDate(new Date("2026-05-10T01:59:59Z")), "2026-05-08"); // KST 10:59
  assert.equal(latestPublishedDate(new Date("2026-05-10T02:00:00Z")), "2026-05-09"); // KST 11:00
  assert.equal(latestPublishedDate(new Date("2026-05-09T15:00:00Z")), "2026-05-08"); // KST 05-10 00:00
  assert.equal(latestPublishedDate(new Date("2027-01-01T03:00:00Z")), "2026-12-31"); // 연도 경계

  mockKma(json(kma({ item: [item({ tm: "2026-05-09" })] })));
  const before = await fetchDailyWeather("2026-05-09", "청송", new Date("2026-05-10T01:59:59Z"));
  assert.equal(before.reason, "not_yet_available");
  assert.equal(calls.length, 0);
  const after = await fetchDailyWeather("2026-05-09", "청송", new Date("2026-05-10T02:00:00Z"));
  assert.equal(after.weather.tempMax, 21.5);
  assert.equal(calls.length, 1);
});

test("a missing key or an unsupported region makes no KMA call", async () => {
  mockKma(json(kma({ item: [item()] })));
  for (const key of [undefined, "", "   "]) {
    if (key === undefined) delete process.env.KMA_ASOS_SERVICE_KEY;
    else process.env.KMA_ASOS_SERVICE_KEY = key;
    const { status, json: body } = await get();
    assert.equal(status, 503);
    assert.equal(body.weather, null);
    assert.equal(body.reason, "key_missing");
  }
  process.env.KMA_ASOS_SERVICE_KEY = KEY;
  for (const region of ["서울", "constructor", undefined]) {
    const result = await fetchDailyWeather(DATE, region);
    assert.equal(result.weather, null);
    assert.equal(result.reason, "unsupported_region");
    assert.equal(result.source, null);
  }
  assert.equal(calls.length, 0);
});

test("the weather result can be passed to /api/diary as it is", async () => {
  async function diaryWith(weather) {
    const response = await POST(new Request("http://localhost/api/diary", { method: "POST", body: JSON.stringify({
      treeId: "tree-1", week: 18, photoType: "tree", vision: { growth_stage: "개화", confidence: "높음" },
      weather, farmerNote: "", farmerConfirmed: true, observedAt: DATE, letters: [],
    }) }));
    return { status: response.status, json: await response.json() };
  }
  mockKma(json(kma({ item: [item({ maxTa: "-1.5", minTa: "-8.2", sumRn: "0" })] })));
  const found = (await get()).json.weather;
  assert.deepEqual(Object.keys(found), ["tempMax", "tempMin", "rainMm"]);
  const withWeather = await diaryWith(found);
  assert.equal(withWeather.status, 200);
  assert.deepEqual(withWeather.json.evidence.weather, { tempMax: -1.5, tempMin: -8.2, rainMm: 0 });
  assert.equal(isDiary(withWeather.json), true);

  mockKma(json({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }));
  const missing = (await get()).json.weather;
  assert.equal(missing, null);
  const withoutWeather = await diaryWith(missing);
  assert.equal(withoutWeather.status, 200);
  assert.equal(withoutWeather.json.evidence.weather, null);
  assert.equal(isDiary(withoutWeather.json), true);
});
