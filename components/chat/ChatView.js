"use client"

import ChatMessage from "./ChatMessages";
import IconButton from "@/components/common/IconButton";
import { IconBack, StageIcon } from "@/components/common/Icons";

export default function ChatView() {
    return (
        <main className="app-shell">
            <header className="chat-header">
                <IconButton label="뒤로" variant="plain">
                    <IconBack />
                </IconButton>
                <span className="stage-badge stage-badge-sm">
                    <StageIcon stage="개화" size={22} />
                </span>
                <div>
                    <div className="chat-header-name">홍이</div>
                    <div className="chat-header-desc">기록에 있는 것만 답해요</div>
                </div>
            </header>
            <ChatMessage
            message={[
                { role:"user", text: "요즘 날씨 어땠어?"},
                { role:"tree", text: "그건 기록에 있니더.", source: "18주차 날씨 기록"},
                { role:"tree", text: "그건 아직 모르겠니더."},
            ]}
            loading={false}
            treeName="홍이" />
        </main>
    )
}