/* 아직 나무를 고르지 않았을 때 (타임라인·수확 앨범 공용) */

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import styles from "./Tree.module.css";

export default function NoTreeSelected({ title }) {
  return (
    <div className="app-shell">
      <header className="page-header">
        <h1 className="title">{title}</h1>
      </header>
      <main className="app-content">
        <Card className={styles.empty}>
          <p style={{ margin: 0 }}>아직 함께할 나무를 고르지 않았어요.</p>
          <Button href="/trees">나무 고르러 가기</Button>
        </Card>
      </main>
    </div>
  );
}
