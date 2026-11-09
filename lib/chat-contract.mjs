// Framework-independent input/output contract for POST /api/chat.
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validWeather = (value) => isRecord(value) && Number.isFinite(value.tempMax)
  && Number.isFinite(value.tempMin) && Number.isFinite(value.rainMm)
  && value.tempMax >= value.tempMin && value.rainMm >= 0;

// 연도가 없는 날짜는 다른 해의 관측값과 혼동될 수 있어 자동 조회하지 않습니다.
export function historicalWeatherDate(question) {
  if (typeof question !== 'string' || !/날씨|기온|강수|비가|비는|비 왔|비 내|최고|최저/u.test(question)) return null;
  const dates = [...question.matchAll(/(\d{4})-(\d{2})-(\d{2})|(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/gu)];
  if (dates.length !== 1) return null;
  const [, y1, m1, d1, y2, m2, d2] = dates[0];
  const date = `${y1 ?? y2}-${String(m1 ?? m2).padStart(2, '0')}-${String(d1 ?? d2).padStart(2, '0')}`;
  return validDate(date) ? date : null;
}

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
    return [{ id, week, title, text: entry.text.trim().slice(0, 4000),
      recordKind: ['demo', 'generated'].includes(entry.recordKind) ? entry.recordKind : null,
      observedAt: validDate(entry.observedAt) ? entry.observedAt : null,
      weather: validWeather(entry.weather)
        ? { tempMax: entry.weather.tempMax, tempMin: entry.weather.tempMin, rainMm: entry.weather.rainMm }
        : null,
    }];
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
    ? [sourceDiary.recordKind === 'demo' ? '시연용 성장일기'
      : sourceDiary.recordKind === 'generated' ? 'AI 생성 성장일기'
        : sourceDiary.week ? `${sourceDiary.week}주차 일기` : '성장일기',
      sourceDiary.week && sourceDiary.recordKind ? `${sourceDiary.week}주차` : null,
      sourceDiary.title].filter(Boolean).join(' · ')
    : null;
  return { answer: result.answer.trim(), source };
}
