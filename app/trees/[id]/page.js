import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconBack } from "@/components/common/Icons";
import AdoptButton from "@/components/tree/AdoptButton";
import styles from "@/components/tree/Tree.module.css";
import { getTree, getTrees } from "@/components/tree/tempData";

export function generateStaticParams() {
  return getTrees().map((tree) => ({ id: tree.id }));
}

export default function TreeProfilePage({ params }) {
  return (
    <div className="app-shell" data-season="spring">
      <header className="top-bar">
        <Link href="/trees" className="btn-back" aria-label="뒤로">
          <IconBack />
        </Link>
        나무 프로필
      </header>

      <main className="app-content">
        {/* 주소의 id를 읽는 부분만 기다리고, 위쪽 틀은 바로 보여줌 */}
        <Suspense fallback={<p className="status-message" role="status">나무를 불러오는 중...</p>}>
          <TreeProfile params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function TreeProfile({ params }) {
  const { id } = await params;
  const tree = getTree(id);
  if (!tree) notFound();

  return (
    <>
      <div className="photo-frame">
        {tree.photo ? (
          <img src={tree.photo} alt={`${tree.name} 사진`} />
        ) : (
          <div className="photo-placeholder">[{tree.name} 사진]</div>
        )}
      </div>

      <h1 className="tree-name" style={{ margin: 0 }}>
        {tree.name}
      </h1>

      <dl className={`card ${styles.facts}`}>
        <dt>품종</dt>
        <dd>{tree.variety}</dd>
        <dt>과수원</dt>
        <dd>{tree.farm.name}</dd>
        <dt>지역</dt>
        <dd>{tree.farm.region} 출신</dd>
      </dl>

      <p className="dialect-meaning">이 나무는 {tree.farm.dialectRegion} 말투로 일기를 써요</p>

      <div className={styles.footer}>
        <AdoptButton treeId={tree.id} treeName={tree.name} />
      </div>
    </>
  );
}
