import TreeCard from "@/components/tree/TreeCard";
import styles from "@/components/tree/Tree.module.css";
import { getTrees } from "@/components/tree/tempData";

export const metadata = {
  title: "나무 고르기 | 내 사과나무 1년",
};

export default function TreeListPage() {
  const trees = getTrees();

  return (
    <div className="app-shell" data-season="spring">
      <header className="page-header">
        <h1 className="title">1년을 함께할 나무를 골라 주세요</h1>
      </header>

      <main className="app-content">
        <ul className={styles.list}>
          {trees.map((tree) => (
            <li key={tree.id}>
              <TreeCard tree={tree} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
