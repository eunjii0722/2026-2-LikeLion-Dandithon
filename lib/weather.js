import "server-only";

// 기상청 지상(종관, ASOS) 일자료 조회서비스입니다. 인증키가 URL에 포함되므로 HTTPS로만 호출합니다.
const ENDPOINT = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList";
const TIMEOUT_MS = 8_000;
// 활용가이드: 전날(D-1) 자료는 다음 날 오전 11시 이후 조회할 수 있습니다.
const PUBLISH_HOUR_KST = 11;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 활용가이드 지점 코드표로 확인한 지점만 등록합니다.
const STATIONS = { 청송: { stationId: "276", stationName: "청송군" } };

// 자료 자체가 없으면 200, 조회에 실패했거나 응답을 믿을 수 없으면 오류 상태로 구분합니다.
const REASONS = {
  unsupported_region: [200, "이 지역의 관측지점은 아직 지원하지 않아요."],
  not_yet_available: [200, "아직 제공되지 않은 날짜예요."],
  no_data: [200, "이 날짜의 관측자료가 없어요."],
  temperature_missing: [200, "기온 관측값이 비어 있어요."],
  rain_missing: [200, "강수량 관측값이 비어 있어요."],
  invalid_observation: [502, "관측값이 올바르지 않아요."],
  observation_mismatch: [502, "요청한 날짜나 관측지점의 자료가 아니에요."],
  key_missing: [503, "기상 자료 조회가 아직 설정되지 않았어요."],
  auth_failed: [502, "기상청 인증에 실패했어요."],
  rate_limited: [503, "기상청 조회 한도를 넘었어요."],
  request_rejected: [502, "기상청이 요청을 거부했어요."],
  upstream_error: [502, "기상청 서비스에 연결하지 못했어요."],
  timeout: [504, "기상청 응답이 늦어지고 있어요."],
  invalid_response: [502, "기상청 응답 형식을 확인하지 못했어요."],
};

// 공식 오류코드입니다. 나머지(01, 02, 04, 05, 12, 99 등)는 서비스 오류로 처리합니다.
function reasonForCode(code) {
  if (code === "03") return "no_data";
  if (["10", "11"].includes(code)) return "request_rejected";
  if (["20", "21", "30", "31", "32", "33"].includes(code)) return "auth_failed";
  if (code === "22") return "rate_limited";
  return "upstream_error";
}

// 한국 시각 기준으로 일자료를 조회할 수 있는 가장 최근 날짜입니다.
export function latestPublishedDate(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const daysBack = kst.getUTCHours() >= PUBLISH_HOUR_KST ? 1 : 2;
  return new Date(kst.getTime() - daysBack * DAY_MS).toISOString().slice(0, 10);
}

// 비어 있으면 null, 숫자가 아니면 NaN입니다. 빈 값을 0으로 바꾸지 않기 위해 Number()를 바로 쓰지 않습니다.
function readNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^-?\d+(\.\d+)?$/u.test(text) ? Number(text) : Number.NaN;
}

function readWeather(item) {
  // 실제 응답의 sumRn에는 "0.0"과 빈 값이 모두 있고, 빈 값이 무강수인지 결측인지 구분할 필드가 없습니다.
  // 확인되지 않은 강수량을 0으로 만들지 않도록 빈 값은 weather: null로 처리합니다.
  // 관측된 기온은 화면 표시 전용 partialWeather로만 돌려줍니다. /api/diary에는 weather만 전달합니다.
  const tempMax = readNumber(item.maxTa);
  const tempMin = readNumber(item.minTa);
  const rainMm = readNumber(item.sumRn);
  if (tempMax === null || tempMin === null) return { reason: "temperature_missing" };
  if (![tempMax, tempMin, rainMm ?? 0].every(Number.isFinite) || tempMax < tempMin || rainMm < 0) {
    return { reason: "invalid_observation" };
  }
  if (rainMm === null) return { reason: "rain_missing", partialWeather: { tempMax, tempMin, rainMm: null } };
  return { weather: { tempMax, tempMin, rainMm } };
}

function readResponse(response, body, date, station) {
  let payload = null;
  try {
    payload = JSON.parse(body);
  } catch {
    // 게이트웨이 오류는 dataType=JSON이어도 XML로 올 수 있어 아래에서 코드만 읽습니다.
  }
  const code = payload?.response?.header?.resultCode
    ?? payload?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode
    ?? body.match(/<(?:returnReasonCode|resultCode)>\s*(\d+)\s*</u)?.[1];

  if (code !== undefined && String(code) !== "00") {
    return { reason: reasonForCode(String(code)), resultCode: String(code) };
  }
  if (!response.ok) return { reason: "upstream_error" };
  if (code === undefined || !payload) return { reason: "invalid_response" };

  const items = payload.response?.body?.items;
  if (items === "" || items === null) return { reason: "no_data" };
  if (typeof items !== "object" || Array.isArray(items)) return { reason: "invalid_response" };
  const list = items.item === undefined ? [] : [items.item].flat();
  if (list.length === 0) return { reason: "no_data" };
  if (!list.every((item) => item !== null && typeof item === "object")) return { reason: "invalid_response" };
  if (list.length > 1) return { reason: "observation_mismatch" };

  const [item] = list;
  if (item.tm !== date || String(item.stnId) !== station.stationId || item.stnNm !== station.stationName) {
    return { reason: "observation_mismatch" };
  }
  return readWeather(item);
}

function toResult(date, station, { weather = null, partialWeather, reason = null, resultCode }) {
  const source = station && { provider: "기상청", network: "ASOS", ...station };
  if (weather) return { status: 200, date, weather, reason: null, source };
  const [status, message] = REASONS[reason];
  return {
    status, date, weather: null, ...(partialWeather && { partialWeather }),
    reason, message, source: source ?? null, ...(resultCode && { resultCode }),
  };
}

// 검증한 날짜(YYYY-MM-DD)의 관측값을 조회합니다. 어떤 실패도 값을 만들지 않고 weather: null로 돌려줍니다.
// 응답에는 인증키와 요청 URL을 넣지 않습니다.
export async function fetchDailyWeather(date, region, now = new Date()) {
  const station = Object.hasOwn(STATIONS, region) ? STATIONS[region] : null;
  if (!station) return toResult(date, null, { reason: "unsupported_region" });
  if (date > latestPublishedDate(now)) return toResult(date, station, { reason: "not_yet_available" });

  const key = process.env.KMA_ASOS_SERVICE_KEY?.trim();
  if (!key) return toResult(date, station, { reason: "key_missing" });

  const day = date.replaceAll("-", "");
  const params = new URLSearchParams({
    numOfRows: "10", pageNo: "1", dataType: "JSON", dataCd: "ASOS", dateCd: "DAY",
    startDt: day, endDt: day, stnIds: station.stationId,
  });
  // 공공데이터포털의 Encoding/Decoding 키를 모두 받습니다. 이미 인코딩된 키는 다시 인코딩하지 않습니다.
  const serviceKey = key.includes("%") ? key : encodeURIComponent(key);

  let response;
  let body;
  try {
    response = await fetch(`${ENDPOINT}?serviceKey=${serviceKey}&${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 인증키가 든 요청을 다른 주소나 평문 HTTP로 따라가지 않습니다.
      redirect: "error",
      cache: "no-store",
    });
    body = await response.text();
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return toResult(date, station, { reason: timedOut ? "timeout" : "upstream_error" });
  }
  return toResult(date, station, readResponse(response, body, date, station));
}
