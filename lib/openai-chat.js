import 'server-only';
import { CHAT_PROMPT, CHAT_RESPONSE_SCHEMA } from './prompts/chat.js';
import { formatChatResponse } from './chat-contract.mjs';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const CHAT_MODEL = 'gpt-5-nano';
const TIMEOUT_MS = 45_000;
// 시연용 프로세스 단위 제한입니다. 분산 환경의 사용량 제한을 대신하지 않습니다.
const REQUESTS_PER_MINUTE = 15;
let windowStart = 0;
let requestCount = 0;

export class ChatServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ChatServiceError';
    this.status = status;
  }
}

function classifyFailure(status, code) {
  if (status === 401 || status === 403) return new ChatServiceError('OpenAI 인증에 실패했습니다. 서버 설정을 확인해 주세요.', 503);
  if (status === 402 || code === 'insufficient_quota') {
    return new ChatServiceError('AI 대화 서비스의 결제 잔액이나 사용 한도가 부족해요. 관리자에게 알려 주세요.', 402);
  }
  if (status === 429) return new ChatServiceError('대화 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  if (status === 408 || status === 504) return new ChatServiceError('대화 생성 시간이 초과되었습니다.', 504);
  return new ChatServiceError('대화 생성 서비스에 연결하지 못했습니다.', 502);
}

function outputText(response) {
  if (!Array.isArray(response?.output)) return '';
  return response.output.filter((item) => item?.type === 'message' && item.role === 'assistant')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text).join('');
}

export async function answerTreeQuestion(payload) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ChatServiceError('서버에 OPENAI_API_KEY가 설정되지 않았습니다.', 500);
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    requestCount = 0;
  }
  if (requestCount >= REQUESTS_PER_MINUTE) {
    throw new ChatServiceError('대화 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }
  requestCount += 1;

  const started = performance.now();
  if (process.env.NODE_ENV === 'development') console.debug('[chat timing]', { phase: 'openai-start' });
  let response;
  let body;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        reasoning: { effort: 'minimal' },
        instructions: CHAT_PROMPT,
        input: JSON.stringify(payload),
        text: { format: { type: 'json_schema', name: 'tree_chat_reply', strict: true, schema: CHAT_RESPONSE_SCHEMA } },
        max_output_tokens: 1024,
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
      cache: 'no-store',
    });
    body = await response.json();
  } catch (error) {
    // 원문 오류에는 사용자 질문이나 요청 정보가 포함될 수 있으므로 반환하거나 기록하지 않습니다.
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ChatServiceError('대화 생성 시간이 초과되었습니다.', 504);
    }
    throw new ChatServiceError('대화 생성 서비스에 연결하지 못했습니다.', 502);
  } finally {
    if (process.env.NODE_ENV === 'development') console.debug('[chat timing]', { phase: 'openai-finished', elapsedMs: Math.round(performance.now() - started), status: response?.status ?? null });
  }
  if (!response.ok) throw classifyFailure(response.status, body?.error?.code);
  if (body?.status !== 'completed' || !outputText(body).trim()) {
    throw new ChatServiceError('대화 생성이 완료되지 않았습니다.', 502);
  }
  try {
    const parsed = JSON.parse(outputText(body));
    return { ...formatChatResponse(parsed, payload.recentDiaries), sourceId: parsed.sourceId };
  } catch {
    throw new ChatServiceError('대화 응답 형식 또는 출처가 올바르지 않습니다.', 502);
  }
}
