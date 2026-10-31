import { Suspense } from "react";
import { notFound } from "next/navigation";
import DiaryClient from "@/components/diary/DiaryClient";

export const metadata = { title: "나무 일기 | 내 사과나무 1년" };

export default function DiaryPage({ params, searchParams }) {
  return (
    <Suspense fallback={<div className="app-shell"><main className="app-content">
      <p className="status-message" role="status">일기를 불러오는 중...</p>
    </main></div>}>
      <DiaryRoute params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DiaryRoute({ params, searchParams }) {
  const { week: value } = await params;
  const query = await searchParams;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 53) notFound();
  const week = Number(value);
  const diaryId = typeof query.id === "string" ? query.id : null;
  return <DiaryClient key={`${week}:${diaryId ?? "regular"}`} week={week} diaryId={diaryId} />;
}
