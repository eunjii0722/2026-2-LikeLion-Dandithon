"use client";

import { useId, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBack } from "@/components/common/Icons";
import DiaryCard from "./DiaryCard";
import { getDiaryModel, getDiaryHref, SEASON_NAMES } from "./diaryData";
import { getDiaryStorageSnapshot, subscribeToDiary } from "./diaryStorage";
import styles from "./Diary.module.css";

const getServerSnapshot = () => null;

export default function DiaryClient({ week, diaryId }) {
  const snapshot = useSyncExternalStore(subscribeToDiary, getDiaryStorageSnapshot, getServerSnapshot);
  const stored = snapshot === null ? null : JSON.parse(snapshot);
  const model = stored ? getDiaryModel(stored, week, diaryId) : { status: "loading" };
  const season = model.diary?.season;
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/timeline");
  }

  return (
    <div className={`app-shell ${styles.shell}`} data-season={SEASON_NAMES[season] ? season : "spring"}>
      <header className="top-bar">
        <button type="button" className="btn-back" aria-label="뒤로" onClick={goBack}><IconBack /></button>
        <span>{week}주차 · {SEASON_NAMES[season] ?? "나무 일기"}</span>
      </header>
      <main className="app-content">
        {model.status === "ready" ? <DiaryDetail key={model.diary.id} model={model} savedWords={stored.savedWords} />
          : <DiaryState status={model.status} currentWeek={model.tree?.currentWeek} />}
      </main>
    </div>
  );
}

function DiaryState({ status, currentWeek }) {
  if (status === "loading") return <p className="status-message" role="status">일기를 불러오는 중...</p>;
  const noTree = status === "no-tree";
  return (
    <section className="card-diary">
      <h1 className="diary-title">{noTree ? "아직 분양받은 나무가 없어요"
        : status === "future" ? "아직 열리지 않은 일기예요" : "이 주의 일기가 아직 없어요"}</h1>
      <p className="diary-text">{noTree ? "나무를 고르면 성장 일기를 만날 수 있어요."
        : "소식이 도착한 주의 일기부터 읽어 보세요."}</p>
      <Link href={noTree ? "/trees" : `/diary/${currentWeek}`} className="btn btn-primary">
        {noTree ? "나무 고르러 가기" : "이번 주 일기 보기"}
      </Link>
    </section>
  );
}

function DiaryDetail({ model, savedWords }) {
  const { diary, previousWeek, nextWeek, related } = model;
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceId = useId();
  return (
    <>
      {!diary.isSpecial && <DiaryPhoto key={diary.photo?.url ?? "placeholder"} photo={diary.photo} />}
      <DiaryCard diary={diary} savedWords={savedWords} />
      <section className={styles.evidenceSection} aria-label="일기의 근거">
        <button type="button" className="evidence-toggle" aria-expanded={evidenceOpen}
          aria-controls={evidenceId} onClick={() => setEvidenceOpen(!evidenceOpen)}>
          <span>이 일기의 근거</span><span>{evidenceOpen ? "접기" : "펼치기"}</span>
        </button>
        {evidenceOpen && <Evidence id={evidenceId} diary={diary} />}
      </section>
      {related.map((item) => <Link key={item.id} href={getDiaryHref(item)} className={`card ${styles.related}`}>
        <span className="caption">{item.isSpecial ? "이번 주 특별 소식" : "이번 주 성장 일기"}</span>
        <span className="link-more">{item.title}</span>
      </Link>)}
      <nav className={`btn-row ${styles.navigation}`} aria-label="주간 일기 이동">
        <WeekLink week={previousWeek} direction="이전" />
        <WeekLink week={nextWeek} direction="다음" />
      </nav>
      {!nextWeek && <p className={`caption ${styles.noMargin}`}>아직 다음 일기가 없어요. 소식이 도착하면 열려요.</p>}
    </>
  );
}

function DiaryPhoto({ photo }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={styles.noMargin}>
      <div className="photo-frame">
        {photo?.url && !failed ? <Image src={photo.url} alt={photo.type === "orchard" ? "과수원 전체 모습" : "내 나무 모습"}
          width={740} height={360} unoptimized onError={() => setFailed(true)} />
          : <div className="photo-placeholder">이번 주 사진 준비 중</div>}
      </div>
      {photo?.type === "orchard" && <figcaption className={`caption ${styles.photoCaption}`}>과수원 전체 모습</figcaption>}
    </figure>
  );
}

function Evidence({ id, diary }) {
  const evidence = diary.evidence ?? {};
  const weather = evidence.weather ?? {};
  const number = (value, unit) => Number.isFinite(value) ? `${value}${unit}` : "기록 없음";
  const fields = [
    [diary.photo?.type === "orchard" ? "생육 단계 (과수원 전체 기준)" : "생육 단계 (내 나무 기준)", evidence.growthStage ?? "판단 불가"],
    ["AI 판단 확신도", evidence.confidence ?? "기록 없음"],
    ["사진 종류", diary.photo?.type === "orchard" ? "과수원 공통 사진" : diary.photo?.type === "tree" ? "내 나무 사진" : "기록 없음"],
    ["확인 출처", evidence.farmerConfirmed === true ? "농부 확인" : evidence.farmerConfirmed === false ? "AI 사진 분석" : "기록 없음"],
    ["최저 · 최고 기온", `${number(weather.tempMin, "°C")} / ${number(weather.tempMax, "°C")}`],
    ["강수량", number(weather.rainMm, "mm")],
    ["농부 메모", evidence.farmerNote?.trim() || "기록 없음"],
    ["확인 날짜", evidence.observedAt || "기록 없음"],
  ];
  return <div id={id} className={`evidence-grid ${styles.evidence}`}>
    {fields.map(([label, value]) => <div key={label}>
      <span className="evidence-label">{label}</span><span>{value}</span>
    </div>)}
  </div>;
}

function WeekLink({ week, direction }) {
  if (week === null) return <button type="button" className="btn btn-secondary is-locked" disabled>{direction} 주</button>;
  return <Link href={`/diary/${week}`} className="btn btn-secondary"
    aria-label={`${direction} 주, ${week}주차 일기`}>{direction} 주 · {week}주차</Link>;
}
