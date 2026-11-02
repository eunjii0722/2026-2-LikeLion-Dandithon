"use client";

import { useSyncExternalStore } from "react";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import { getSavedWords, subscribeToStorage } from "@/lib/storage";
import styles from "./Words.module.css";

// 같은 내용은 같은 문자열로 반환하여 불필요한 재렌더링을 막는다.
const getSnapshot = () => JSON.stringify(getSavedWords());
const getServerSnapshot = () => null;
const subscribe = (onChange) => subscribeToStorage(onChange, ["savedWords"]);

export default function WordsClient() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const words = snapshot === null ? null : JSON.parse(snapshot);

  return (
    <div className={`app-shell ${styles.shell}`}>
      <header className="page-header">
        <div className={styles.heading}>
          <span className="caption">사투리 단어장</span>
          <h1 className="title">나무한테 배운 말</h1>
          {words !== null && <p className={`caption ${styles.noMargin}`} role="status">
            모은 단어 {words.length}개
          </p>}
        </div>
      </header>
      <main className="app-content">
        {words === null ? (
          <p className="status-message" role="status">단어장을 불러오는 중...</p>
        ) : words.length === 0 ? (
          <Card>
            <p className={`diary-text ${styles.emptyText}`}>
              일기 속 밑줄 친 말을 눌러 단어를 모아 보세요
            </p>
          </Card>
        ) : (
          <ul className={styles.list} aria-label="모은 사투리 단어">
            {words.map(({ word, meaning, week }, index) => (
              <li key={JSON.stringify([word, meaning, week, index])}>
                <Card className={styles.wordCard}>
                  <h2 className="diary-title">{word}</h2>
                  <p className={`dialect-meaning-text ${styles.noMargin}`}>{meaning}</p>
                  <p className={`caption ${styles.noMargin}`}>{week}주차에 배움</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" href="/timeline">일기 보러 가기</Button>
      </main>
    </div>
  );
}
