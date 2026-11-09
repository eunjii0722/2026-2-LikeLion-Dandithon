import { formatChatResponse, parseChatPayload } from '@/lib/chat-contract.mjs';
import { answerTreeQuestion, ChatServiceError } from '@/lib/openai-chat.js';
import { getTree } from '@/lib/data.js';
import { loadChatWeather, resolveWeatherIntent, safeWeatherAnswer } from '@/lib/chat-weather.js';

const MAX_BODY_BYTES = 128 * 1024;
const TREE_FACT_QUESTION = /꽃|열매|사과|생육|성장|건강|수확|일기|기록/u;

function groundedDiaryReply(question, result, diaries) {
  const sourceDiary = diaries.find((diary) => diary.id === result.sourceId);
  const orchardFlower = (diary) => /과수원/u.test(diary.text)
    && /하얀 꽃|꽃(?:이|들이)? 보|꽃 사진/u.test(diary.text)
    && !/꽃(?:이|은|들이)?\s*(?:안|없|보이지)/u.test(diary.text)
    && /그중|어느 게|개별/u.test(diary.text);
  const flowerDiary = /꽃/u.test(question) && (!sourceDiary || orchardFlower(sourceDiary))
    ? (sourceDiary ?? diaries.findLast(orchardFlower)) : null;
  if (flowerDiary && orchardFlower(flowerDiary)) {
    const flower = /하얀 꽃/u.test(flowerDiary.text) ? '하얀 꽃' : '꽃';
    const date = flowerDiary.observedAt ? `${flowerDiary.observedAt} ` : '';
    const answer = `${date}과수원 사진에서 ${flower}이 보였데이. 다만 내 꽃인지 확인된 기록은 없제.`;
    return formatChatResponse({ answer, sourceId: flowerDiary.id }, diaries);
  }
  if (result.source || !TREE_FACT_QUESTION.test(question)) {
    return { answer: result.answer, source: result.source };
  }
  const subject = /꽃/u.test(question) ? '꽃 소식'
    : /열매|사과/u.test(question) ? '열매 소식' : '그 소식';
  return { answer: `${subject}은 확인된 성장일기 근거가 없어서 단정할 수 없데이.`, source: null };
}

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
  let aiMs = 0;
  if (process.env.NODE_ENV === "development") console.debug("[chat timing]", { phase: "server-received" });
  const respond = (body, init = {}) => Response.json(body, {
    ...init, ...(process.env.NODE_ENV === "development" ? { headers: {
      "Server-Timing": `total;dur=${(performance.now() - started).toFixed(1)}, ai;dur=${aiMs.toFixed(1)}`,
    } } : {}),
  });
  try {
    const parsed = await readBoundedJson(request);
    if (parsed.error) return respond({ error: parsed.error }, { status: parsed.status });
    const contract = parseChatPayload(parsed.value);
    if (contract.error) return respond({ error: contract.error }, { status: contract.status });
    const now = new Date();
    const intent = resolveWeatherIntent(contract.value.question, contract.value.history, now);
    let weatherContext = null;
    if (intent) {
      const tree = getTree(contract.value.treeId);
      if (!tree) return respond({ error: '존재하지 않는 treeId입니다.' }, { status: 404 });
      weatherContext = await loadChatWeather(intent, tree.farm.region, now);
      if (weatherContext.error) {
        return respond({ error: weatherContext.error, errorType: 'weather' }, { status: weatherContext.status });
      }
    }
    let result;
    const aiStarted = performance.now();
    try { result = await answerTreeQuestion({ ...contract.value, weatherContext }); }
    catch (error) {
      // ASOS 관측값은 AI가 응답하지 못해도 안전하게 안내할 수 있습니다.
      // 일기 질문은 AI 오류를 그대로 전달합니다.
      if (!weatherContext || !(error instanceof ChatServiceError)) throw error;
      return respond({
        answer: safeWeatherAnswer('', weatherContext),
        source: `${weatherContext.sourceLabel} · AI 응답 불가`,
      });
    }
    finally { aiMs = performance.now() - aiStarted; }
    if (!weatherContext) return respond(groundedDiaryReply(contract.value.question, result, contract.value.recentDiaries));
    return respond({
      answer: safeWeatherAnswer(result.answer, weatherContext),
      source: weatherContext.sourceLabel,
    });
  } catch (error) {
    if (error instanceof ChatServiceError) {
      return respond({ error: error.message }, { status: error.status });
    }
    return respond({ error: '대화 요청을 처리하는 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
