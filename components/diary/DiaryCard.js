"use client";

import { useId, useState } from "react";
import { splitDialectText } from "./diaryUtils";
import { saveWord } from "./diaryStorage";
import styles from "./Diary.module.css";

// 농부 화면 - 생성 일기 미리보기에서 같은 카드를 재사용 가능
export default function DiaryCard({ diary, savedWords = [] }) {
  const [selectedWord, setSelectedWord] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const meaningId = useId();
  const isSaved = selectedWord && savedWords.some((item) =>
    item.word === selectedWord.word && item.meaning === selectedWord.meaning);

  function selectWord(word) {
    setSelectedWord(selectedWord?.word === word.word ? null : word);
    setFeedback(null);
  }

  function handleSave() {
    const saved = saveWord({ word: selectedWord.word, meaning: selectedWord.meaning, week: diary.week });
    setFeedback(saved
      ? { error: false, text: "단어장에 담았어요." }
      : { error: true, text: "단어를 저장하지 못했어요. 브라우저 저장 공간과 저장소 사용 설정을 확인해 주세요." });
  }

  return (
    <article className="card-diary" aria-labelledby={`diary-title-${diary.id}`}>
      {diary.isSpecial && <span className="caption">특별 소식</span>}
      <h1 id={`diary-title-${diary.id}`} className="diary-title">{diary.title}</h1>
      <p className={`diary-text ${styles.body}`}>
        {splitDialectText(diary.text, diary.dialectWords).map((part, index) => part.word ? (
          <button key={index} type="button" className="dialect-word"
            aria-expanded={selectedWord?.word === part.word.word} aria-controls={meaningId}
            onClick={() => selectWord(part.word)}>{part.text}</button>
        ) : part.text)}
      </p>
      {selectedWord && (
        <div id={meaningId} className={`dialect-meaning ${styles.meaning}`}>
          <div>
            <div className="dialect-meaning-word">{selectedWord.word}</div>
            <div className="dialect-meaning-text">{selectedWord.meaning}</div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(isSaved)}
            onClick={handleSave}>{isSaved ? "저장됨" : "단어장에 담기"}</button>
        </div>
      )}
      {feedback && <p className={`${feedback.error ? "error-message" : "status-message"} ${styles.noMargin}`}
        role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    </article>
  );
}
