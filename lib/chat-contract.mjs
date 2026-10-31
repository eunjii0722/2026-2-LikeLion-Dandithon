// Framework-independent input/output contract for POST /api/chat.
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

export function parseChatPayload(body) {
  if (!isRecord(body)) {
    return { error: '요청 본문은 JSON 객체여야 합니다.', status: 400 };
  }
  const { treeId, question, history = [], recentDiaries = [] } = body;
  if (!nonEmpty(treeId) || !nonEmpty(question)) {
    return { error: 'treeId와 question은 비어 있지 않은 문자열이어야 합니다.', status: 400 };
  }
  if (!Array.isArray(history) || !Array.isArray(recentDiaries)) {
    return { error: 'history와 recentDiaries는 전달할 경우 배열이어야 합니다.', status: 400 };
  }
  if (treeId.length > 128 || question.length > 2000 || history.length > 100 || recentDiaries.length > 100) {
    return { error: '요청 항목이 너무 길거나 많습니다.', status: 400 };
  }

  // The original mock accepted arrays without element schemas. Preserve that
  // acceptance, extracting only explicitly recognized fields for the model.
  const safeHistory = history.slice(-20).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const rawRole = entry.role ?? entry.sender;
    const role = rawRole === 'user' ? 'user' : rawRole === 'assistant' ? 'assistant' : null;
    const content = entry.content ?? entry.text ?? entry.message;
    if (!role || !nonEmpty(content)) return [];
    return [{ role, content: content.trim().slice(0, 2000) }];
  });
  const seen = new Set();
  const safeDiaries = recentDiaries.slice(-30).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (entry.treeId !== undefined && entry.treeId !== treeId) return [];
    const id = entry.id;
    if (!nonEmpty(id) || id.length > 128 || seen.has(id) || !nonEmpty(entry.text)) return [];
    seen.add(id);
    const week = Number.isSafeInteger(entry.week) && entry.week > 0 ? entry.week : null;
    const title = nonEmpty(entry.title) ? entry.title.trim().slice(0, 120) : null;
    return [{ id, week, title, text: entry.text.trim().slice(0, 4000) }];
  });

  return { value: { treeId: treeId.trim(), question: question.trim(), history: safeHistory, recentDiaries: safeDiaries } };
}

export function formatChatResponse(result, recentDiaries) {
  if (!isRecord(result) || !nonEmpty(result.answer) || result.answer.length > 3000 ||
      !(result.sourceId === null || typeof result.sourceId === 'string')) {
    throw new Error('INVALID_CHAT_RESULT');
  }
  const sourceDiary = result.sourceId === null ? null : recentDiaries.find((diary) => diary.id === result.sourceId);
  if (result.sourceId !== null && !sourceDiary) throw new Error('INVALID_CHAT_SOURCE');
  const source = sourceDiary
    ? [sourceDiary.week ? `${sourceDiary.week}주차 일기` : '성장일기', sourceDiary.title].filter(Boolean).join(' · ')
    : null;
  return { answer: result.answer.trim(), source };
}
