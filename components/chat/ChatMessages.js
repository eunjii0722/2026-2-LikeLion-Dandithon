// 말풍선 목록

function sourceLabel(source) {
    return typeof source === "string" && source.trim()
        ? source.startsWith("조회 상태 · ") ? source : `근거 · ${source}`
        : "기록에 없는 내용이에요";
}

export default function ChatMessage({ messages, loading, delayNotice, treeName, endRef }) {
    return (
        <div className="chat-list" aria-live = "polite">
            {messages.map((message, index) => {
                const content = message.content ?? message.text ?? message.message;

                if (message.role === "user") {
                    return (
                        <div key={index} className="bubble bubble-me">
                            {content}
                        </div>
                    );
                }

                return (
                    <div key={index} className="bubble-group">
                        <div className="bubble bubble-tree">{content}</div>
                        <div className="bubble-source">{sourceLabel(message.source)}</div>
                    </div>
                );
            })}
            {loading && (
                <p className="status-message" role = "status">
                    {treeName}가 생각하는 중...
                    {delayNotice && <><br />{delayNotice}</>}
                </p>
            )}
            <div ref={endRef}/>
        </div>
    )
}
