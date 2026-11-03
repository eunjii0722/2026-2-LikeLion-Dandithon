// Runs the real Diary generator/validator with an in-memory SDK. No external requests.
import assert from "node:assert/strict";
import { register } from "node:module";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";

const sdk = `export class GoogleGenAI { interactions = { create: async (request, options) => {
  globalThis.diaryCalls.push({request, options});
  return {status: 'completed', output_text: JSON.stringify(globalThis.diaryReply)};
} }; }`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if(specifier === 'server-only') return {shortCircuit:true,url:'data:text/javascript,export {}'};
  if(specifier === '@google/genai') return {shortCircuit:true,url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(sdk)}`)}};
  return nextResolve(specifier,context);
}`)}`);
const { generateTreeDiary } = await import("../lib/gemini.js");
const previous = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "unit-test-placeholder";
after(() => {
  if (previous === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previous;
  delete globalThis.diaryCalls;
  delete globalThis.diaryReply;
});
const records = JSON.parse(await readFile(new URL("../data/demo/records.json", import.meta.url), "utf8"));
const edits = JSON.parse(await readFile(new URL("../data/demo/editorial.json", import.meta.url), "utf8"));
const input = records[0].diaryRequest;
const reply = () => {
  const { title, text, dialectWords } = edits["tree-1-w18"];
  return { title, text, dialectWords };
};

test("real generator accepts natural scope without the two old required phrases and preserves model settings", async () => {
  globalThis.diaryCalls = [];
  globalThis.diaryReply = reply();
  assert.deepEqual(await generateTreeDiary(input), reply());
  assert.equal(globalThis.diaryCalls.length, 1);
  assert.equal(globalThis.diaryCalls[0].request.model, "gemini-3.5-flash-lite");
  assert.equal(globalThis.diaryCalls[0].request.store, false);
  assert.equal(globalThis.diaryCalls[0].options.maxRetries, 0);
});

test("real generator rejects missing orchard scope and fabricated farmer confirmation after bounded retry", async () => {
  for (const text of ["과수원 전체 사진이 왔어. 내 꽃이 피었어. 참 반갑다. 다음에 보자.",
    "과수원 사진이라 내 모습인지는 모르겠어. 농부가 직접 확인했어. 참 반갑다. 다음에 보자."]) {
    globalThis.diaryCalls = [];
    globalThis.diaryReply = { title: "검사", text, dialectWords: [] };
    await assert.rejects(generateTreeDiary(input), (error) => error.status === 502);
    assert.equal(globalThis.diaryCalls.length, 2);
  }
});

test("real generator keeps sentence and JSON validation while permitting an empty glossary", async () => {
  globalThis.diaryCalls = [];
  globalThis.diaryReply = { ...reply(), dialectWords: [] };
  assert.deepEqual((await generateTreeDiary(input)).dialectWords, []);
  for (const broken of [{ ...reply(), text: "한 문장." }, { ...reply(), extra: true }]) {
    globalThis.diaryReply = broken;
    await assert.rejects(generateTreeDiary(input), (error) => error.status === 502);
  }
});
