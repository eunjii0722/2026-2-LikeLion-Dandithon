"use client";

import { useSyncExternalStore } from "react";
import { getTree } from "@/lib/data";
import { getSelectedTreeId, subscribeToSelectedTree } from "@/lib/storage";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import FarmerForm from "./FarmerForm";
import styles from "./Farmer.module.css";

const getServerSnapshot = () => undefined;

export default function FarmerClient() {
  const treeId = useSyncExternalStore(subscribeToSelectedTree, getSelectedTreeId, getServerSnapshot);
  const tree = treeId ? getTree(treeId) : null;

  return (
    <div className={`app-shell ${styles.shell}`}>
      <header className="page-header">
        <div className={styles.stack}>
          <span className="caption">농부 화면 · {tree?.farm.name ?? "과수원 선택 전"}</span>
          <h1 className="title">이번 주 나무 소식</h1>
          {tree && <span className="caption">{tree.farm.region} · {tree.name}</span>}
        </div>
      </header>
      <main className="app-content">
        {treeId === undefined ? (
          <p className="status-message" role="status">과수원 정보를 불러오는 중...</p>
        ) : tree ? <FarmerForm key={tree.id} tree={tree} /> : (
          <Card className={styles.section}>
            <h2 className="title">먼저 나무를 선택해 주세요</h2>
            <p className={`caption ${styles.noMargin}`}>선택한 나무의 과수원에 소식을 남길 수 있어요.</p>
            <Button href="/trees">나무 선택하기</Button>
          </Card>
        )}
      </main>
    </div>
  );
}
