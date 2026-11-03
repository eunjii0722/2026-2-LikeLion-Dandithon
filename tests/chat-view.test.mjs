// /chat 화면이 /api/chat에 보내는 요청의 회귀 검사입니다. 실제 저장소·route를 실행하되 Gemini 호출만 대역으로 바꿉니다.
// 모델이 일기를 실제로 어떻게 답변에 쓰는지는 이 테스트로 확인할 수 없습니다.
import assert from "node:assert/strict";
import { register } from "node:module";
import { after, afterEach, beforeEach, test } from "node:test";
import { getDiary } from "../lib/data.js";
import { formatChatResponse, parseChatPayload } from "../lib/chat-contract.mjs";
import { getAllDiaries } from "../lib/storage.js";
import { requestChat, toChatDiaries, visibleDiaries } from "../components/chat/chatApi.js";

const fakeGemini = `
export class ChatServiceError extends Error {}
export async function answerTreeQuestion(payload) {
  globalThis.chatPayloads.push(payload);
  return { answer: "답변", source: null };
}
`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/gemini-chat.js") return { shortCircuit: true, url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(fakeGemini)}`)} };
  if (specifier.startsWith("@/")) return nextResolve(new URL(specifier.slice(2), ${JSON.stringify(new URL("../", import.meta.url).href)}).href, context);
  return nextResolve(specifier, context);
}
`)}`);
const { POST } = await import("../app/api/chat/route.js");

const CURRENT_WEEK = 18;
const PHOTO = `data:image/jpeg;base64,${"A".repeat(200_000)}`;
const STATIC_IDS = ["tree-1-w16", "tree-1-w18", "tree-1-w18-special"];
const realFetch = globalThis.fetch;

const generated = (over = {}) => ({
  ...getDiary("tree-1", 18),
  id: "tree-1-w17", week: 17, title: "생성 일기", text: "생성 본문이에요.", ...over,
});
function seedGenerated(diaries) {
  const stored = new Map([["generatedDiaries", JSON.stringify(diaries)]]);
  globalThis.window = {
    localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
  };
}
// 화면과 같은 경로로 요청 본문을 만듭니다.
async function sentBody({ messages = [], diaries = toChatDiaries(getAllDiaries("tree-1"), CURRENT_WEEK) } = {}) {
  let body;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/chat");
    body = init.body;
    return Response.json({ answer: "답변", source: null });
  };
  await requestChat({ treeId: "tree-1", question: "질문", messages, recentDiaries: diaries });
  return body;
}

beforeEach(() => {
  globalThis.chatPayloads = [];
  seedGenerated([]);
});
afterEach(() => { globalThis.fetch = realFetch; });
after(() => { delete globalThis.window; });

test("history reads content, text and message fields and maps tree to assistant", async () => {
  const body = JSON.parse(await sentBody({ messages: [
    { role: "user", content: "content 필드" }, { role: "tree", text: "text 필드" }, { role: "user", message: "message 필드" },
    { role: "tree", message: "나무의 message 필드" },
  ] }));
  const expected = [
    { role: "user", content: "content 필드" }, { role: "assistant", content: "text 필드" },
    { role: "user", content: "message 필드" }, { role: "assistant", content: "나무의 message 필드" },
  ];
  assert.deepEqual(body.history, expected);
  assert.deepEqual(parseChatPayload(body).value.history, expected, "the server must keep every entry");
});

test("history keeps the existing field priority and the last 10 messages", async () => {
  const priority = JSON.parse(await sentBody({ messages: [{ role: "user", content: "1", text: "2", message: "3" }, { role: "user", text: "2", message: "3" }] }));
  assert.deepEqual(priority.history.map((item) => item.content), ["1", "2"]);
  const messages = Array.from({ length: 12 }, (_, index) => ({ role: "user", text: `m${index}` }));
  const recent = JSON.parse(await sentBody({ messages }));
  assert.deepEqual(recent.history.map((item) => item.content), messages.slice(-10).map((item) => item.text));
});

test("static diaries reach the API when nothing has been generated", async () => {
  const { recentDiaries } = JSON.parse(await sentBody());
  assert.deepEqual(recentDiaries.map((diary) => diary.id), STATIC_IDS);
  for (const diary of recentDiaries) assert.deepEqual(Object.keys(diary), ["id", "treeId", "week", "title", "text"]);
  assert.deepEqual(parseChatPayload(JSON.parse(await sentBody())).value.recentDiaries.map((diary) => diary.id), STATIC_IDS);
});

test("generated diaries are sent together with static ones, in week order", async () => {
  seedGenerated([generated(), generated({ id: "tree-1-w18", week: 18, title: "교체된 18주차" })]);
  const { recentDiaries } = JSON.parse(await sentBody());
  assert.deepEqual(recentDiaries.map((diary) => [diary.id, diary.week]), [
    ["tree-1-w16", 16], ["tree-1-w17", 17], ["tree-1-w18", 18], ["tree-1-w18-special", 18],
  ]);
  assert.equal(recentDiaries.find((diary) => diary.id === "tree-1-w18").title, "교체된 18주차");
});

test("future weeks and other trees never reach the API", async () => {
  seedGenerated([
    generated({ id: "tree-1-w19", week: 19, text: "미래 기록" }),
    generated({ id: "tree-1-w41", week: 41, text: "미래 기록" }),
    generated({ id: "tree-2-w10", treeId: "tree-2", week: 10, text: "다른 나무 기록" }),
    generated({ id: "tree-1-w18", week: 18, title: "현재 주차 경계" }),
  ]);
  const raw = await sentBody();
  assert.deepEqual(JSON.parse(raw).recentDiaries.map((diary) => diary.id), STATIC_IDS);
  assert.ok(!raw.includes("미래 기록") && !raw.includes("다른 나무 기록"));
  assert.ok(raw.includes("현재 주차 경계"), "the current week itself is included");
});

test("visible diaries stop at the current week for the stage icon too", () => {
  const diaries = [{ week: 17 }, { week: 18 }, { week: 19 }];
  assert.deepEqual(visibleDiaries(diaries, 18), [{ week: 17 }, { week: 18 }]);
  assert.deepEqual(visibleDiaries([], 18), []);
});

test("photos and other evidence are not sent, so a large photo cannot break the chat", async () => {
  seedGenerated([generated({ photo: { url: PHOTO, type: "tree" } })]);
  const raw = await sentBody();
  for (const text of ["base64", "data:image", "photo", "evidence", "farmerNote", "dialectWords"]) {
    assert.ok(!raw.includes(text), text);
  }
  const post = (body) => POST(new Request("http://localhost/api/chat", { method: "POST", body }));
  const response = await post(raw);
  assert.equal(response.status, 200);
  assert.ok(globalThis.chatPayloads[0].recentDiaries.some((diary) => diary.id === "tree-1-w17"));

  // 수정 전처럼 일기 전체를 보내면 서버 본문 한도(128KB)에 걸립니다.
  const full = JSON.stringify({ treeId: "tree-1", question: "질문", recentDiaries: getAllDiaries("tree-1") });
  assert.equal((await post(full)).status, 413);
});

test("the newest diaries survive when there are more than the API uses", () => {
  const many = Array.from({ length: 40 }, (_, index) => generated({ id: `d${index}`, week: index + 1 }));
  const shuffled = [...many].reverse();
  const sent = toChatDiaries(shuffled, 53);
  assert.deepEqual(sent.map((diary) => diary.week), many.slice(-30).map((diary) => diary.week));
  assert.deepEqual(parseChatPayload({ treeId: "tree-1", question: "질문", recentDiaries: sent }).value.recentDiaries.map((diary) => diary.week),
    sent.map((diary) => diary.week));
});

test("a source can only name a diary that was actually sent", async () => {
  seedGenerated([generated({ id: "tree-1-w20", week: 20 })]);
  const { value } = parseChatPayload(JSON.parse(await sentBody()));
  assert.deepEqual(formatChatResponse({ answer: "답", sourceId: "tree-1-w18" }, value.recentDiaries),
    { answer: "답", source: "18주차 일기 · 꽃잎이 날리던 한 주" });
  assert.throws(() => formatChatResponse({ answer: "답", sourceId: "tree-1-w20" }, value.recentDiaries));
});

test("requestChat reports API failures so the screen can show its error", async () => {
  const call = () => requestChat({ treeId: "tree-1", question: "질문", messages: [], recentDiaries: [] });
  globalThis.fetch = async () => Response.json({ error: "서버 오류" }, { status: 500 });
  await assert.rejects(call, /서버 오류/u);
  globalThis.fetch = async () => new Response("<html>", { status: 502 });
  await assert.rejects(call, /대화 요청에 실패했어요/u);
  globalThis.fetch = async () => Response.json({ source: null });
  await assert.rejects(call, /대화 요청에 실패했어요/u);
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(call, TypeError);
});
