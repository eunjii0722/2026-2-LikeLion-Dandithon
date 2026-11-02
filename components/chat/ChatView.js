"use client"

import { useCallback, useEffect, useRef, useState } from "react";
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
    getGeneratedDiaries,
    getSelectedTreeId,
    subscribeToStorage,
 } from "@/lib/storage";
import { requestChat } from "./chatApi";

const SAMPLE_QUESTIONS = ["요즘 날씨 어땠어?", "꽃은 언제 폈어?"];
const ERROR_TEXT = "지금은 홍이가 대답하기 어려워요. 잠시 후 다시 물어봐주세요.";

export default function ChatView() {
    const router = useRouter();
    const endRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const [tree, setTree] = useState(null);
    const [stage, setStage] = useState(undefined);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const refresh = useCallback(() => {
        const treeId = getSelectedTreeId();
        const found = treeId ? getTree(treeId) : null;
        setTree(found);
        setMessages(treeId ? getChatHistory(treeId) : []);
        const diaries = treeId ? getAllDiaries(treeId) : [];
        const latest = [...diaries].sort((a,b) => b.week - a.week)[0];
        setStage(latest?.evidence?.growthStage);
        setLoaded(true);
    }, []);

    useEffect(() => {
        refresh();
        return subscribeToStorage(refresh, ["selectedTreeId", "chatHistory", "generatedDiaries"]);
    }, [refresh]);

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
                recentDiaries : getGeneratedDiaries(tree.id),
            });
            if(!addChatMessage({treeId : tree.id, role: "tree", text: answer, source})) setError(ERROR_TEXT);
        } catch {
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