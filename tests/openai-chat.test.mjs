import assert from 'node:assert/strict';
import { register } from 'node:module';
import { afterEach, beforeEach, test } from 'node:test';

register('data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript," }; return nextResolve(specifier, context); }');
const { answerTreeQuestion, ChatServiceError } = await import('../lib/openai-chat.js');

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const payload = { treeId: 'tree-1', question: '꽃이 폈어?', history: [], weatherContext: null,
  recentDiaries: [{ id: 'd1', week: 18, title: '꽃 소식', text: '과수원 사진에 꽃이 보였어.', recordKind: 'demo' }] };

beforeEach(() => { process.env.OPENAI_API_KEY = 'TEST-KEY'; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

test('OpenAI chat sends server-only credentials and structured diary evidence', async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [
      { type: 'output_text', text: JSON.stringify({ answer: '과수원 사진에 꽃이 보였데이.', sourceId: 'd1' }) },
    ] }] });
  };
  const result = await answerTreeQuestion(payload);
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent.init.headers.Authorization, 'Bearer TEST-KEY');
  assert.equal(sent.body.model, 'gpt-5-nano');
  assert.deepEqual(sent.body.reasoning, { effort: 'minimal' });
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.text.format.strict, true);
  assert.deepEqual(JSON.parse(sent.body.input), payload);
  assert.ok(!sent.init.body.includes('TEST-KEY'));
  assert.deepEqual(result, { answer: '과수원 사진에 꽃이 보였데이.', source: '시연용 성장일기 · 18주차 · 꽃 소식', sourceId: 'd1' });
});

test('OpenAI chat distinguishes billing, authentication, and incomplete output', async () => {
  globalThis.fetch = async () => Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 });
  await assert.rejects(answerTreeQuestion(payload), (error) => error instanceof ChatServiceError && error.status === 402);
  globalThis.fetch = async () => Response.json({ error: { code: 'invalid_api_key' } }, { status: 401 });
  await assert.rejects(answerTreeQuestion(payload), (error) => error instanceof ChatServiceError && error.status === 503);
  globalThis.fetch = async () => Response.json({ status: 'incomplete', output: [] });
  await assert.rejects(answerTreeQuestion(payload), (error) => error instanceof ChatServiceError && error.status === 502);
});
