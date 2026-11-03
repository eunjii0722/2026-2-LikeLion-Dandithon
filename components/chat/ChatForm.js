"use client";

import { useState } from "react";
import IconButton from "@/components/common/IconButton";
import { IconSend } from "@/components/common/Icons";

export default function ChatForm({ onSend, disabled, treeName= "나무"}) {
    const [value, setValue] = useState("");

    function handleSubmit(event) {
        event.preventDefault();
        const question = value.trim();
        if(!question || disabled) return;
        onSend(question);
        setValue("");
    }

    return (
        <form className="chat-form" onSubmit={handleSubmit}>
            <label htmlFor="chat-input" className="visually-hidden">
                {treeName}
            </label>
            <input
            id = "chat-input"
            className= "input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={`${treeName}에게 물어보기`}
            maxLength={200}/>

            <IconButton 
            type = "submit"
            label = "보내기"
            variant="send"
            disabled = {disabled || !value.trim()}>
                <IconSend/>
            </IconButton>
        </form>
    );
}