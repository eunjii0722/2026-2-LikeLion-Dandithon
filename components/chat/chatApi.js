// api/chat으로 질문을 보내고 답 받아오는 함수. 요청 모양이 바뀌면 이 파일만 수정

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

export async function requestChat ({ treeId, question, messages, recentDiaries }) {
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type" : "application/json"},
        body: JSON.stringify({
            treeId,
            question,
            history: toApiHistory(messages),
            recentDiaries,
        }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.answer) {
        throw new Error(data?.error ?? "대화 요청에 실패했어요.");
    }
    return { answer: data.answer, source: data.source ?? null};
}