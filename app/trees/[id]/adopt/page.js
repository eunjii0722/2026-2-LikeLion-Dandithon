import { Suspense } from "react";
import { notFound } from "next/navigation";
import Card from "@/components/common/Card";
import TopBar from "@/components/common/TopBar";
import AdoptButton from "@/components/tree/AdoptButton";
import { withGa } from "@/components/tree/josa";
import styles from "@/components/tree/Tree.module.css";
import { getTree, getTrees } from "@/lib/data";

/* =========================================================
   분양 신청 (가짜 결제 화면)
   ---------------------------------------------------------
   프로필의 "이 나무 분양받기" → 이 화면 → "결제하고 분양받기"
   → 고른 나무 저장 → "분양 완료" → 홈
   실제 결제는 하지 않고, 카드번호 같은 결제 정보 입력칸도 두지 않음
   ========================================================= */

export function generateStaticParams() {
  return getTrees().map((tree) => ({ id: tree.id }));
}

export default function AdoptPage({ params }) {
  return (
    <div className="app-shell" data-season="spring">
      <TopBar title="분양 신청" />

      <main className="app-content">
        <Suspense fallback={<p className="status-message" role="status">나무를 불러오는 중...</p>}>
          <AdoptSummary params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function AdoptSummary({ params }) {
  const { id } = await params;
  const tree = getTree(id);
  if (!tree) notFound();

  return (
    <>
      <p className="error-message" role="note" style={{ margin: 0 }}>
        시연용 화면이에요. 실제로 결제되지 않아요.
      </p>

      <Card>
        <dl className={styles.facts}>
          <dt>나무</dt>
          <dd>
            {tree.name} ({tree.variety})
          </dd>
          <dt>과수원</dt>
          <dd>
            {tree.farm.region} {tree.farm.name}
          </dd>
          <dt>분양 기간</dt>
          <dd>
            {tree.startWeek}주차부터 {tree.harvestWeek}주차 수확까지
          </dd>
        </dl>
      </Card>

      <Card>
        <p className="caption" style={{ margin: 0 }}>
          분양받으면
        </p>
        <ul className={styles.benefits}>
          <li>매주 {withGa(tree.name)} 쓴 나무 일기를 받아요</li>
          <li>{tree.name}에게 편지를 쓰고 이야기를 나눠요</li>
          <li>가을에 {tree.name}의 사과를 집으로 받아요</li>
        </ul>
      </Card>

      <div className={styles.footer}>
        <AdoptButton treeId={tree.id} treeName={tree.name} />
      </div>
    </>
  );
}
