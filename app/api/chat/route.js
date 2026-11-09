import { historicalWeatherDate, parseChatPayload } from '@/lib/chat-contract.mjs';
import { answerTreeQuestion, ChatServiceError } from '@/lib/gemini-chat.js';
import { getTree } from '@/lib/data.js';
import { fetchDailyWeather } from '@/lib/weather.js';

const MAX_BODY_BYTES = 128 * 1024;

async function readBoundedJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return { status: 413, error: '요청 본문 크기가 너무 큽니다.' };
  }
  if (!request.body) return { status: 400, error: '요청 본문은 올바른 JSON이어야 합니다.' };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { status: 413, error: '요청 본문 크기가 너무 큽니다.' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { status: 400, error: '요청 본문은 올바른 JSON이어야 합니다.' };
  }
}

export async function POST(request) {
  const started = performance.now();
  let geminiMs = 0;
  if (process.env.NODE_ENV === "development") console.debug("[chat timing]", { phase: "server-received" });
  const respond = (body, init = {}) => Response.json(body, {
    ...init, ...(process.env.NODE_ENV === "development" ? { headers: {
      "Server-Timing": `total;dur=${(performance.now() - started).toFixed(1)}, gemini;dur=${geminiMs.toFixed(1)}`,
    } } : {}),
  });
  try {
    const parsed = await readBoundedJson(request);
    if (parsed.error) return respond({ error: parsed.error }, { status: parsed.status });
    const contract = parseChatPayload(parsed.value);
    if (contract.error) return respond({ error: contract.error }, { status: contract.status });
    const weatherDate = historicalWeatherDate(contract.value.question);
    if (weatherDate) {
      const tree = getTree(contract.value.treeId);
      if (!tree) return respond({ error: '존재하지 않는 treeId입니다.' }, { status: 404 });
      const observed = await fetchDailyWeather(weatherDate, tree.farm.region);
      if (observed.status !== 200) return respond({ error: observed.message, errorType: 'weather' }, { status: observed.status });
      if (!observed.weather) {
        return respond({ answer: `${weatherDate}의 ${tree.farm.region} 일자료는 ${observed.message} 실시간 날씨도 아니데이.`, source: null });
      }
      const { tempMax, tempMin, rainMm } = observed.weather;
      return respond({
        answer: `${weatherDate} 청송군 관측값은 최고 ${tempMax}°C, 최저 ${tempMin}°C, 강수량 ${rainMm}mm였데이. 과거 하루 일자료라 지금 날씨는 아니데이.`,
        source: `기상청 ASOS · ${observed.source.stationName} · ${weatherDate}`,
      });
    }
    let result;
    const aiStarted = performance.now();
    try { result = await answerTreeQuestion(contract.value); }
    finally { geminiMs = performance.now() - aiStarted; }
    return respond(result);
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return respond({ error: error.message }, { status: error.status });
    }
    return respond({ error: '대화 요청을 처리하는 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
