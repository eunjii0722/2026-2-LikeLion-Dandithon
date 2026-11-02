"use client";

import { useState } from "react";
import Button from "@/components/common/Button";
import { addLetter } from "@/lib/storage";

const MAX_LENGTH = 200;

export default function LetterForm({tree}) {
    const [text, setText] = useState("");
    const [message, setMessage] = useState(null);

    function handleSubmit(event) {
        event.preventDefault();
        const trimmed = text.trim();
        if(!trimmed) return;

        const saved = addLetter({
            treeId: tree.id,
            week: tree.currentWeek,
            text: trimmed,
            usedInDiaryId: null,
        });

        if(saved) {
            setText("");
            setMessage({ok : true, text:"편지를 보냈어요. 다음 일기에서 나무가 답해 줄 거예요."});
        } else {
            setMessage({ok:false, text:"편지를 보내지 못했어요. 잠시 후 다시 시도해 주세요."});
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <p className="caption">보낸 편지는 다음 일기에 나무가 답해 줘요.</p>
            <label htmlFor="letter-text" className="caption">
                {tree.name}에게 보낼 편지
            </label>
            <textarea 
            id="letter-text"
            className="textarea"
            rows={6}
            maxLength={MAX_LENGTH}
            value={text}
            onChange={(event)=>setText(event.target.value)}/>
            <p className="caption">
                {text.length} / {MAX_LENGTH}자
            </p>
            <Button type="submit" block disabled={!text.trim()}>
                편지 보내기
            </Button>
            {message && (
                <p
                className={message.ok ? "status-message" : "error-message"}
                role = {message.ok ? "status" : "alert"}>
                    {message.text}
                </p>
            )}
        </form>
    );
}