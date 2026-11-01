// api/chat으로 질문을 보내고 답 받아오는 함수. 요청 모양이 바뀌면 이 파일만 수정

const MAX_HISTORY = 10;

// 저장된 메시지 하나에서 글자 부분을 꺼냄
function messageText(message) {
    return message.content ?? message.text ?? message/message;
}

export async function requestChat ({ treeId, question, messages, recentDiaries }) {
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type" : "application/json"},
        body: JSON.stringify({
            treeId,
            question,
            history: toApiHistory(message),
            recentDiaries,
        }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.answer) {
        throw new Error(data?.error ?? "대화 요청에 실패했어요.");
    }
    return { answer: data.answer, source: data.source ?? null};
}