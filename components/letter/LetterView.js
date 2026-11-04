"use client";

import { useEffect, useState } from "react";
import TopBar from "@/components/common/TopBar";
import Button from "@/components/common/Button";
import { getActiveTree } from "@/lib/storage";
import { getSelectedTreeId, getLetters, subscribeToStorage } from "@/lib/storage";
import LetterForm from "./LetterForm";
import LetterList from "./LetterList";

export default function LetterView() {
    const [loaded, setLoaded] = useState(false);
    const [tree, setTree] = useState(null);
    const [letters, setLetters] = useState([]);

    useEffect(() => {
        function refresh() {
            const treeId = getSelectedTreeId();
            setTree(treeId ? getActiveTree(treeId) : null);
            setLetters(treeId ? getLetters(treeId) : []);
            setLoaded(true);
        }
        refresh();
        return subscribeToStorage(refresh, ["selectedTreeId", "letters", "generatedDiaries"]);
    }, []);

    return (
        <main className="app-shell">
            <TopBar title={tree ? `${tree.name}에게 편지` : "나무에게 편지"}/>
            <div className="app-content">
                {!loaded && <p className="status-message">불러오는 중...</p>}
                {loaded && !tree && (
                    <>
                    <p className="status-message">먼저 나무를 분양받아 주세요.</p>
                    <Button href="/trees">나무 고르러 가기</Button>
                    </>
                )}
                {loaded && tree && (
                    <>
                    <LetterForm key={tree.id} tree={tree}/>
                    <LetterList letters={letters}/>
                    </>
                )}
            </div>
        </main>
    );
}
