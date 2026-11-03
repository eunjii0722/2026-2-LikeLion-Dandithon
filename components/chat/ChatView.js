"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ChatMessage from "./ChatMessages";
import ChatForm from "./ChatForm";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import { IconBack, StageIcon } from "@/components/common/Icons";
import { getTree } from "@/lib/data";
import { 
    addChatMessage,
    getAllDiaries,
    getChatHistory,
    getSelectedTreeId,
    subscribeToStorage,
 } from "@/lib/storage";
import { requestChat, toChatDiaries, visibleDiaries } from "./chatApi";

const SAMPLE_QUESTIONS = ["요즘 날씨 어땠어?", "꽃은 언제 폈어?"];
const ERROR_TEXT = "지금은 홍이가 대답하기 어려워요. 잠시 후 다시 물어봐주세요.";

const subscribe = (onChange) => subscribeToStorage(onChange, ["selectedTreeId", "chatHistory", "generatedDiaries"]);
const getServerSnapshot = () => null;

// 같은 내용은 같은 문자열로 반환해 불필요한 재렌더링을 막음
function getSnapshot() {
    const treeId = getSelectedTreeId();
    const found = treeId ? getTree(treeId) : null;
    const diaries = found ? visibleDiaries(getAllDiaries(found.id), found.currentWeek) : [];
    const latest = [...diaries].sort((a,b) => b.week - a.week)[0];
    return JSON.stringify({
        treeId,
        messages: treeId ? getChatHistory(treeId) : [],
        stage: latest?.evidence?.growthStage,
    });
}

export default function ChatView() {
    const router = useRouter();
    const endRef = useRef(null);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const { loaded, tree, stage, messages } = useMemo(() => {
        if (snapshot === null) return { loaded: false, tree: null, stage: undefined, messages: [] };
        const { treeId, stage, messages } = JSON.parse(snapshot);
        return { loaded: true, tree: treeId ? getTree(treeId) : null, stage, messages };
    }, [snapshot]);

    useEffect(()=>{
        endRef.current?.scrollIntoView?.({ block: "end"});
    }, [messages, loading]);

    async function handleSend(question) {
        if(!tree || loading) return;
        setError(null);
        const previous = messages;
        
        if(!addChatMessage({ treeId : tree.id, role: "user", text: question})) {
            setError(ERROR_TEXT);
            return;
        }

        setLoading(true);
        try {
            const {answer, source} = await requestChat({
                treeId : tree.id,
                question,
                messages : previous,
                recentDiaries : toChatDiaries(getAllDiaries(tree.id), tree.currentWeek),
            });
            if(!addChatMessage({treeId : tree.id, role: "tree", text: answer, source})) setError(ERROR_TEXT);
        } catch (caught){
            console.error("대화 요청 실패 : ", caught);
            setError(ERROR_TEXT);
        } finally {
            setLoading(false);
        }
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
                <ChatMessage messages={messages} loading={loading} treeName={tree.name} endRef={endRef}/>
                {error && (
                    <p className="error-message" role="alert">
                        {error}
                    </p>
                )}
                <ChatForm onSend={handleSend} disabled={loading} treeName={tree.name}/>
                </>
            )}
        </main>
    );
}