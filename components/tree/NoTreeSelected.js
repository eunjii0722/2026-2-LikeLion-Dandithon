/* 아직 나무를 고르지 않았을 때 (타임라인·수확 앨범 공용) */

import Link from "next/link";
import styles from "./Tree.module.css";

export default function NoTreeSelected({ title }) {
  return (
    <div className="app-shell">
      <header className="page-header">
        <h1 className="title">{title}</h1>
      </header>
      <main className="app-content">
        <div className={`card ${styles.empty}`}>
          <p style={{ margin: 0 }}>아직 함께할 나무를 고르지 않았어요.</p>
          <Link href="/trees" className="btn btn-primary">
            나무 고르러 가기
          </Link>
        </div>
      </main>
    </div>
  );
}
