import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { CHAT_PROMPT, CHAT_RESPONSE_SCHEMA } from './prompts/chat.js';
import { formatChatResponse } from './chat-contract.mjs';

const CHAT_MODEL = 'gemini-3.8-flash';
// Demo-only process-local limiter; not a production/distributed rate limit.
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

export async function answerTreeQuestion(payload) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ChatServiceError('서버에 GEMINI_API_KEY가 설정되지 않았습니다.', 500);
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    requestCount = 0;
  }
  if (requestCount >= REQUESTS_PER_MINUTE) {
    throw new ChatServiceError('대화 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
  }
  requestCount += 1;

  let interaction;
  try {
    const client = new GoogleGenAI({ apiKey });
    interaction = await client.interactions.create({
      model: CHAT_MODEL,
      system_instruction: CHAT_PROMPT,
      input: [{ type: 'text', text: JSON.stringify(payload) }],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: CHAT_RESPONSE_SCHEMA,
      },
      generation_config: { max_output_tokens: 1024 },
      store: false,
      automatic_continuation: false,
    }, { timeout_ms: 45_000, maxRetries: 0 });
  } catch (error) {
    // Never expose raw SDK errors: they could contain user-provided data.
    if (error?.status === 429) throw new ChatServiceError('Gemini 사용 한도에 도달했습니다.', 429);
    if (error?.status === 401 || error?.status === 403) {
      throw new ChatServiceError('Gemini 인증에 실패했습니다. 서버 설정을 확인해 주세요.', 503);
    }
    if (error?.name === 'APIConnectionTimeoutError' || error?.name === 'TimeoutError' || error?.status === 504) {
      throw new ChatServiceError('대화 생성 시간이 초과되었습니다.', 504);
    }
    throw new ChatServiceError('대화 생성 서비스에 연결하지 못했습니다.', 502);
  }
  if (interaction?.status !== 'completed' || typeof interaction.output_text !== 'string' || !interaction.output_text.trim()) {
    throw new ChatServiceError('대화 생성이 완료되지 않았습니다.', 502);
  }
  try {
    return formatChatResponse(JSON.parse(interaction.output_text), payload.recentDiaries);
  } catch {
    throw new ChatServiceError('대화 응답 형식 또는 출처가 올바르지 않습니다.', 502);
  }
}
