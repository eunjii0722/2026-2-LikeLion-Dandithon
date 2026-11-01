// 기존 백엔드 계약의 회귀 검사입니다. Gemini 실제 호출·프론트 E2E를 대체하지 않습니다.
import assert from "node:assert/strict";
import test from "node:test";
import { parseChatPayload, formatChatResponse } from "../lib/chat-contract.mjs";

test("Chat rejects invalid bodies and input limits", () => {
  for (const body of [null, [], {}, { treeId: "t", question: "" },
    { treeId: "t", question: "q", history: {} }, { treeId: "t", question: "q".repeat(2001) }]) {
    assert.equal(parseChatPayload(body).status, 400);
  }
});
test("Chat preserves optional defaults and history aliases", () => {
  assert.deepEqual(parseChatPayload({ treeId: " t ", question: " q " }).value,
    { treeId: "t", question: "q", history: [], recentDiaries: [] });
  assert.deepEqual(parseChatPayload({ treeId: "t", question: "q", history: [{ sender: "user", text: "hello" }] }).value.history,
    [{ role: "user", content: "hello" }]);
});
test("Chat excludes foreign and duplicate diary references", () => {
  const { value } = parseChatPayload({ treeId: "t", question: "q", recentDiaries: [
    { id: "a", text: "one" }, { id: "a", text: "duplicate" }, { id: "b", treeId: "other", text: "foreign" }, null,
  ] });
  assert.deepEqual(value.recentDiaries.map(item => item.id), ["a"]);
});
test("Chat keeps answer/source response shape", () => {
  assert.deepEqual(formatChatResponse({ answer: " hi ", sourceId: null }, []), { answer: "hi", source: null });
  assert.deepEqual(formatChatResponse({ answer: "hi", sourceId: "a" }, [{ id: "a", week: 18, title: "봄" }]),
    { answer: "hi", source: "18주차 일기 · 봄" });
});
test("Chat rejects malformed replies and invented source IDs", () => {
  for (const result of [null, { answer: "", sourceId: null }, { answer: "hi", sourceId: "invented" }]) {
    assert.throws(() => formatChatResponse(result, []));
  }
});
