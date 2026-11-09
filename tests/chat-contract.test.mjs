// 기존 백엔드 계약의 회귀 검사입니다. Gemini 실제 호출·프론트 E2E를 대체하지 않습니다.
import assert from "node:assert/strict";
import test from "node:test";
import { historicalWeatherDate, parseChatPayload, formatChatResponse } from "../lib/chat-contract.mjs";

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
test("Chat retains only valid dated weather from a diary", () => {
  const entries = [
    { id: "a", text: "a", observedAt: "2026-09-26", recordKind: "generated",
      weather: { tempMax: 24.5, tempMin: 16, rainMm: 0.1 } },
    { id: "b", text: "b", observedAt: "2026-02-30", recordKind: "other",
      weather: { tempMax: 20, tempMin: 10, rainMm: null } },
  ];
  const { recentDiaries } = parseChatPayload({ treeId: "t", question: "q", recentDiaries: entries }).value;
  assert.deepEqual(recentDiaries[0].weather, entries[0].weather);
  assert.equal(recentDiaries[0].observedAt, "2026-09-26");
  assert.equal(recentDiaries[1].weather, null);
  assert.equal(recentDiaries[1].observedAt, null);
  assert.equal(recentDiaries[1].recordKind, null);
});
test("only one explicit valid date with a weather question triggers historical lookup", () => {
  assert.equal(historicalWeatherDate("2026년 9월 26일 비가 왔어?"), "2026-09-26");
  assert.equal(historicalWeatherDate("2026-09-26 최고기온은?"), "2026-09-26");
  for (const question of ["9월 26일 날씨?", "2026-02-30 날씨?", "2026-09-26 사과색은?",
    "2026-09-26과 2026-09-27 날씨?", "오늘 날씨는?"]) {
    assert.equal(historicalWeatherDate(question), null, question);
  }
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
