// api/chat으로 질문을 보내고 답 받아오는 함수. 요청 모양이 바뀌면 이 파일만 수정
import * as storage from "../../lib/storage.js";

const MAX_HISTORY = 10;
// api/chat이 일기 배열의 뒤쪽 30개만 사용함. 꽃 핀 시기처럼 지난 기록을 묻는 질문에도 답하도록 한도만큼 보냄
const MAX_DIARIES = 30;

// 저장된 메시지 하나에서 글자 부분을 꺼냄
function messageText(message) {
    return message.content ?? message.text ?? message.message;
}

// 현재 주차까지의 일기만 남김. 미래 주차 기록은 답변과 아이콘의 근거로 쓰지 않음
export function visibleDiaries(diaries, currentWeek) {
    return diaries.filter((diary) => diary.week <= currentWeek);
}

// 대화에 필요한 정보만 오래된 주차부터 담음. 사진 데이터와 다른 근거 정보는 보내지 않음
export function toChatDiaries(diaries, currentWeek) {
    return visibleDiaries(diaries, currentWeek)
        .sort((a, b) => a.week - b.week)
        .slice(-MAX_DIARIES)
        .map(({ id, treeId, week, title, text }) => ({ id, treeId, week, title, text }));
}

function toApiHistory(messages) {
    return messages.slice(-MAX_HISTORY).map((message)=> ({
        role: message.role === "tree" ? "assistant" : "user",
        content: messageText(message),
    }));
}

export const CHAT_TIMEOUT_MS = 55_000;
export function chatDelayMessage(seconds) {
    return seconds >= 20 ? "응답이 지연되고 있어요. 조금만 더 기다려 주세요."
        : seconds >= 8 ? "답변을 준비하는 데 시간이 조금 걸리고 있어요." : "";
}
export function startChatTiming() { return performance.now(); }
export function logChatTiming(phase, started, extra = {}) {
    if (process.env.NODE_ENV === "development") console.debug("[chat timing]", {
        phase, elapsedMs: Math.round(performance.now() - started), ...extra,
    });
}
export async function requestChat({ treeId, question, messages, recentDiaries }, { timeoutMs = CHAT_TIMEOUT_MS } = {}) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const body = JSON.stringify({ treeId, question, history: toApiHistory(messages), recentDiaries });
    logChatTiming("request-start", started, { bytes: new TextEncoder().encode(body).length });
    try {
        const response = await fetch("/api/chat", {
            method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        logChatTiming("response-received", started, { status: response.status, serverTiming: response.headers.get("server-timing") });
        const errors = {
            429: "요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.",
            502: "AI가 답변을 만들지 못했어요. 다시 시도해 주세요.",
            504: "답변 시간이 초과됐어요. 다시 시도해 주세요.",
        };
        if (controller.signal.aborted) throw new Error("timeout");
        if (!response.ok || !data?.answer) throw new Error(errors[response.status] ?? data?.error ?? "대화 요청에 실패했어요.");
        return { answer: data.answer, source: data.source ?? null };
    } catch (error) {
        logChatTiming("request-error", started);
        if (controller.signal.aborted) throw new Error("답변 시간이 초과됐어요. 다시 시도해 주세요.");
        if (error instanceof TypeError) throw new Error("연결에 문제가 있어요. 네트워크를 확인해 주세요.");
        throw error;
    } finally { clearTimeout(timer); }
}

// 답을 받지 못한 마지막 질문. 다시 시도할 때 같은 질문을 또 저장하지 않는 기준
export function unansweredQuestion(messages) {
    const last = messages.at(-1);
    return last?.role === "user" ? messageText(last) : null;
}

// 화면을 벗어났다 돌아와도 진행 중인 요청을 알 수 있도록 React 밖에서 관리함
let activeRequest = null;
const requestListeners = new Set();
function setActiveRequest(value) {
    activeRequest = value;
    requestListeners.forEach((listener) => listener());
}
export function getActiveChatRequest() { return activeRequest; }
export function subscribeToChatRequest(listener) {
    requestListeners.add(listener);
    return () => requestListeners.delete(listener);
}

// 요청은 한 번에 하나만 보냄. 실패해도 저장된 대화는 지우지 않고 error만 돌려줌
export async function sendChatQuestion(treeId, question, { store = storage, request = requestChat } = {}) {
    if (activeRequest) return { sent: false };
    const current = store.getChatHistory(treeId);
    const retry = unansweredQuestion(current) === question;
    const previous = retry ? current.slice(0, -1) : current;
    if (!retry && !store.addChatMessage({ treeId, role: "user", text: question })) {
        return { sent: false, error: "질문을 저장하지 못했어요. 다시 시도해 주세요." };
    }
    const started = startChatTiming();
    setActiveRequest({ treeId, started });
    try {
        const { answer, source } = await request({
            treeId,
            question,
            messages: previous,
            recentDiaries: toChatDiaries(store.getAllDiaries(treeId), store.getActiveTree(treeId).currentWeek),
        });
        if (!store.addChatMessage({ treeId, role: "tree", text: answer, source })) throw new Error("답변을 저장하지 못했어요. 다시 시도해 주세요.");
        logChatTiming("response-saved", started);
        return { sent: true };
    } catch (error) {
        return { sent: true, error: error.message };
    } finally {
        setActiveRequest(null);
    }
}
