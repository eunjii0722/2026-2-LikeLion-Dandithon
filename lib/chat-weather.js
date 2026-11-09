import "server-only";
import { historicalWeatherDate } from "./chat-contract.mjs";
import { fetchDailyWeather, latestPublishedDate } from "./weather.js";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEATHER_TERMS = /날씨|기온|강수|비가|비는|비 왔|비 내|최고|최저|춥|덥/u;
const YESTERDAY_FOLLOWUP = /^어제(?:는|도)?[?？!.,\s]*$/u;

function kstDate(now) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function resolveWeatherIntent(question, history = [], now = new Date()) {
  // 일기 자체를 묻는 질문은 저장된 기록을 근거로 답하는 기존 경로를 유지합니다.
  if (/일기|성장\s*기록|기록에/u.test(question)) return null;
  const previousUser = history.filter((item) => item.role === "user").at(-1)?.content ?? "";
  const followup = YESTERDAY_FOLLOWUP.test(question) && WEATHER_TERMS.test(previousUser);
  if (!WEATHER_TERMS.test(question) && !followup) return null;

  const today = kstDate(now);
  const published = latestPublishedDate(now);
  const explicit = historicalWeatherDate(question);
  if (explicit) return { kind: "date", dates: [explicit], today, published };
  if (/오늘|지금|현재/u.test(question)) return { kind: "today", dates: [], today, published };
  if (/어제/u.test(question) || followup) return { kind: "yesterday", dates: [shiftDate(today, -1)], today, published };
  if (/지난\s*주/u.test(question)) {
    const mondayOffset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const first = shiftDate(today, -mondayOffset - 7);
    return { kind: "last_week", dates: Array.from({ length: 7 }, (_, index) => shiftDate(first, index)), today, published };
  }
  return { kind: "recent", dates: [published], today, published };
}

export async function loadChatWeather(intent, region, now = new Date()) {
  if (!intent) return null;
  const requested = intent.dates.length === 0 ? [intent.today] : intent.dates;
  if (intent.kind === "today") {
    return {
      kind: intent.kind, range: requested, latestPublishedDate: intent.published,
      observations: [], unavailable: [{ date: intent.today, reason: "today_unavailable", message: "당일 ASOS 일자료는 아직 제공되지 않아요." }],
      sourceLabel: `조회 상태 · ${intent.today} 당일 일자료 미공개`,
    };
  }

  const results = await Promise.all(intent.dates.map((date) => fetchDailyWeather(date, region, now)));
  const observations = results.filter((result) => result.weather !== null).map((result) => ({
    date: result.date, weather: result.weather,
    source: { provider: result.source.provider, network: result.source.network,
      stationId: result.source.stationId, stationName: result.source.stationName },
  }));
  const unavailable = results.filter((result) => result.weather === null).map((result) => ({
    date: result.date, reason: result.reason, message: result.message,
  }));
  const firstError = results.find((result) => result.status !== 200);
  if (observations.length === 0 && firstError) {
    return { error: firstError.message, status: firstError.status };
  }
  const firstDate = requested[0];
  const lastDate = requested.at(-1);
  const range = firstDate === lastDate ? firstDate : `${firstDate}~${lastDate}`;
  const station = observations[0]?.source.stationName ?? region;
  const sourceLabel = observations.length
    ? `기상청 ASOS · ${station} · ${range} 일자료${requested.length > 1 ? ` (실제 관측 ${observations.length}/${requested.length}일)` : ""}`
    : `조회 상태 · 기상청 ASOS · ${station} · ${range} · ${unavailable[0]?.message ?? "자료 없음"}`;
  return { kind: intent.kind, range: requested, latestPublishedDate: intent.published,
    observations, unavailable, sourceLabel };
}

// 생성 답변이 수치를 바꾸거나 근거가 있는데도 모른다고 반복하면 관측값으로 안전하게 답합니다.
export function safeWeatherAnswer(answer, context) {
  const records = context.observations;
  if (records.length === 0) {
    if (context.kind === "today") {
      return `오늘 ${context.range[0]}의 현재 날씨나 예보는 아직 받지 못했데이. 기상청 ASOS 일자료는 하루가 지난 뒤 공개되니, 오늘 날씨라고 단정할 수 없제.`;
    }
    return `${context.range[0]}${context.range.length > 1 ? `부터 ${context.range.at(-1)}까지` : ""}의 확인된 관측자료가 없데이. ${context.unavailable[0]?.message ?? "자료를 확인하지 못했어요."}`;
  }

  const temperatures = new Set(records.flatMap(({ weather }) => [weather.tempMax, weather.tempMin]));
  const rainfall = new Set(records.map(({ weather }) => weather.rainMm));
  const amounts = [...answer.matchAll(/(-?\d+(?:\.\d+)?)\s*(°C|℃|도|mm|밀리미터)/gu)];
  const invented = amounts.some(([, raw, unit]) => !(unit === "mm" || unit === "밀리미터" ? rainfall : temperatures).has(Number(raw)));
  const unsupportedCondition = /맑|흐리|눈이|바람|햇살|쾌청|습하|예보|실시간/u.test(answer);
  if (!invented && !unsupportedCondition && !/모르겠|알 수 없|자료가 없/u.test(answer) && amounts.length > 0) return answer;

  if (records.length === 1) {
    const { date, weather } = records[0];
    return `${date} 청송군 ASOS 기록은 최고 ${weather.tempMax}°C, 최저 ${weather.tempMin}°C, 강수량 ${weather.rainMm}mm였데이. 이건 과거 하루 관측값이지 지금 날씨는 아니제.`;
  }
  const maxes = records.map(({ weather }) => weather.tempMax);
  const mins = records.map(({ weather }) => weather.tempMin);
  return `${context.range[0]}부터 ${context.range.at(-1)}까지 청송군 ASOS에서 ${records.length}일 자료를 확인했데이. 확인된 날들의 최고기온은 ${Math.min(...maxes)}~${Math.max(...maxes)}°C, 최저기온은 ${Math.min(...mins)}~${Math.max(...mins)}°C였제. 누락된 날은 추측하지 않았어.`;
}
