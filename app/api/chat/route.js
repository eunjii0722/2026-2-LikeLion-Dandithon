import { parseChatPayload } from '@/lib/chat-contract.mjs';
import { answerTreeQuestion, ChatServiceError } from '@/lib/gemini-chat.js';

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
