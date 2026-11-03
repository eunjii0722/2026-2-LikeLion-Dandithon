"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ChatMessage from "./ChatMessages";
import ChatForm from "./ChatForm";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import { IconBack, StageIcon } from "@/components/common/Icons";
import { getDiaryStage, getPlannedStage } from "@/lib/data";
import { getActiveTree } from "@/lib/storage";
import {
    getAllDiaries,
    getChatHistory,
    getSelectedTreeId,
    subscribeToStorage,
 } from "@/lib/storage";
import {
    chatDelayMessage,
    getActiveChatRequest,
    logChatTiming,
    sendChatQuestion,
    subscribeToChatRequest,
    unansweredQuestion,
    visibleDiaries,
} from "./chatApi";

const SAMPLE_QUESTIONS = ["요즘 날씨 어땠어?", "꽃은 언제 폈어?"];

const subscribe = (onChange) => subscribeToStorage(onChange, ["selectedTreeId", "chatHistory", "generatedDiaries"]);
const getServerSnapshot = () => null;

// 같은 내용은 같은 문자열로 반환해 불필요한 재렌더링을 막음
function getSnapshot() {
    const treeId = getSelectedTreeId();
    const found = treeId ? getActiveTree(treeId) : null;
    const diaries = found ? visibleDiaries(getAllDiaries(found.id), found.currentWeek) : [];
    const latest = [...diaries].sort((a,b) => b.week - a.week)[0];
    return JSON.stringify({
        treeId,
        messages: treeId ? getChatHistory(treeId) : [],
        stage: getPlannedStage(found) ?? (latest ? getDiaryStage(latest, found) : null),
        currentWeek: found?.currentWeek,
    });
}

export default function ChatView() {
    const router = useRouter();
    const endRef = useRef(null);
    const startedRef = useRef(null);
    const [elapsed, setElapsed] = useState(0);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const activeRequest = useSyncExternalStore(subscribeToChatRequest, getActiveChatRequest, getServerSnapshot);
    const [error, setError] = useState(null);

    const { loaded, tree, stage, messages } = useMemo(() => {
        if (snapshot === null) return { loaded: false, tree: null, stage: undefined, messages: [] };
        const { treeId, stage, messages } = JSON.parse(snapshot);
        return { loaded: true, tree: treeId ? getActiveTree(treeId) : null, stage, messages };
    }, [snapshot]);
    const loading = Boolean(tree) && activeRequest?.treeId === tree.id;
    const unanswered = loading ? null : unansweredQuestion(messages);

    useEffect(()=>{
        endRef.current?.scrollIntoView?.({ block: "end"});
    }, [messages, loading]);

    useEffect(() => {
        if (!activeRequest) return;
        startedRef.current = activeRequest.started;
        const timer = setInterval(() => setElapsed(Math.floor((performance.now() - activeRequest.started) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [activeRequest]);
    useEffect(() => {
        if (startedRef.current === null || messages.at(-1)?.role !== "tree") return;
        logChatTiming("screen-committed", startedRef.current);
        startedRef.current = null;
    }, [messages]);

    async function handleSend(question) {
        if(!tree) return;
        setError(null);
        setElapsed(0);
        const result = await sendChatQuestion(tree.id, question);
        if(result.error) setError(result.error);
    }

    return (
        <main className="app-shell">
            <header className="chat-header">
                <IconButton label="뒤로" variant="plain" onClick={() => router.back()}>
                    <IconBack />
                </IconButton>
                <span className="stage-badge stage-badge-sm">
                    <StageIcon stage={stage} size={22} />
                </span>
                <div>
                    <div className="chat-header-name">{tree ? tree.name : "나무"}</div>
                    <div className="chat-header-desc">기록에 있는 것만 답해요</div>
                </div>
            </header>

            {!loaded && <p className="status-message">불러오는 중...</p>}

            {loaded && !tree && (
                <div className="app-content">
                    <p className="status-message">먼저 나무를 분양받아 주세요.</p>
                    <Button href="/trees">나무 고르러 가기</Button>
                </div>
            )}

            {loaded && tree && (
                <>
                {messages.length === 0 && !loading && (
                    <div className="app-content">
                        <p className="caption">이런 걸 물어볼 수 있어요.</p>
                        {SAMPLE_QUESTIONS.map((question) => (
                            <Button key={question} variant="secondary" small onClick={() => handleSend(question)}>
                                {question}
                            </Button>
                        ))}
                    </div>
                )}
                <ChatMessage messages={messages} loading={loading} delayNotice={chatDelayMessage(elapsed)} treeName={tree.name} endRef={endRef}/>
                {!loading && (error || unanswered) && (
                    <div className="error-message" role="alert" style={{
                        margin: "0 var(--space-4) var(--space-3)", display: "flex", alignItems: "center",
                        justifyContent: "space-between", gap: "var(--space-3)",
                    }}>
                        <span>{error ?? "아직 답을 받지 못한 질문이 있어요."}</span>
                        {unanswered && <Button variant="secondary" small style={{ flexShrink: 0 }}
                            onClick={() => handleSend(unanswered)}>다시 시도</Button>}
                    </div>
                )}
                <ChatForm onSend={handleSend} disabled={loading} treeName={tree.name}/>
                </>
            )}
        </main>
    );
}