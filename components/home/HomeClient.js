"use client";

import { useSyncExternalStore } from "react";
import HomeView from "./HomeView";
import { getHomeDataForTree } from "./homeData";
import { getSelectedTreeId, subscribeToSelectedTree } from "./homeStorage";

// 서버에서는 선택 상태를 알 수 없으며, 브라우저에서 읽기 전까지 로딩 표시
const getServerSnapshot = () => undefined;

export default function HomeClient() {
  const treeId = useSyncExternalStore(
    subscribeToSelectedTree, getSelectedTreeId, getServerSnapshot,
  );

  if (treeId === undefined) {
    return (
      <div className="app-shell">
        <header className="page-header"><h1 className="title">나의 사과나무</h1></header>
        <main className="app-content">
          <p className="status-message" role="status">내 나무를 불러오는 중...</p>
        </main>
      </div>
    );
  }

  const { tree, diary } = getHomeDataForTree(treeId);
  return <HomeView tree={tree} diary={diary} />;
}
