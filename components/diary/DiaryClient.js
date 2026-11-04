"use client";

import { useId, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { IconBack } from "@/components/common/Icons";
import DiaryCard from "./DiaryCard";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import PhotoPlaceholder from "@/components/common/PhotoPlaceholder";
import { getDiaryModel, getDiaryHref, getDiaryStage, getPlannedStage, isStageAdjusted, SEASON_NAMES } from "@/lib/data";
import { getDiaryStorageSnapshot, subscribeToDiary } from "@/lib/storage";
import styles from "./Diary.module.css";

const getServerSnapshot = () => null;

// 일기가 없는 주의 단계. 이번 주는 시기 표현, 수확 주는 예정으로만 표시합니다.
function pendingStage(model, week) {
  if (model.status === "future") return week === model.tree.harvestWeek ? "수확 예정" : null;
  return model.status === "missing" && week === model.tree.currentWeek ? getPlannedStage(model.tree) : null;
}

export default function DiaryClient({ week, diaryId }) {
  const snapshot = useSyncExternalStore(subscribeToDiary, getDiaryStorageSnapshot, getServerSnapshot);
  const stored = snapshot === null ? null : JSON.parse(snapshot);
  const model = stored ? getDiaryModel(stored, week, diaryId) : { status: "loading" };
  const season = model.diary?.season;
  const pending = pendingStage(model, week);
  const stage = model.diary ? getDiaryStage(model.diary, model.tree) : pending;

  return (
    <div className={`app-shell ${styles.shell}`} data-season={SEASON_NAMES[season] ? season : "spring"}>
      <header className="top-bar">
        <Link href="/timeline" className="btn-back" aria-label="타임라인으로 돌아가기"><IconBack /></Link>
        <span>생육 {week}주차 · {[SEASON_NAMES[season], stage].filter(Boolean).join(" · ") || "나무 일기"}</span>
      </header>
      <main className="app-content">
        {model.status === "ready" ? <DiaryDetail key={model.diary.id} model={model} savedWords={stored.savedWords} />
          : <DiaryState status={model.status} previousDiary={model.previousDiary} pending={pending} />}
      </main>
    </div>
  );
}

function DiaryState({ status, previousDiary, pending }) {
  if (status === "loading") return <p className="status-message" role="status">일기를 불러오는 중...</p>;
  const noTree = status === "no-tree";
  return (
    <section className="card-diary">
      <h1 className="diary-title">{noTree ? "아직 분양받은 나무가 없어요"
        : status === "future" ? "아직 열리지 않은 일기예요" : "이 주의 일기가 아직 없어요"}</h1>
      <p className="diary-text">{noTree ? "나무를 고르면 성장 일기를 만날 수 있어요."
        : status === "missing" && pending ? `지금은 ${pending} 시기예요. 이번 주 사진이 도착하면 일기가 열려요.`
          : "소식이 도착한 주의 일기부터 읽어 보세요."}</p>
      <div className={styles.stateActions}>
        {noTree ? <Button href="/trees">나무 고르러 가기</Button>
          : previousDiary && <Button href={getDiaryHref(previousDiary)}>지난 일기 보기</Button>}
        <Button href="/timeline" variant="secondary">타임라인 보기</Button>
      </div>
    </section>
  );
}

function DiaryDetail({ model, savedWords }) {
  const { tree, diary, previousWeek, nextWeek, related } = model;
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceId = useId();
  return (
    <>
      {!diary.isSpecial && <DiaryPhoto key={diary.photo?.url ?? "placeholder"} photo={diary.photo} />}
      {/* 같은 ID로 재생성돼도 이전 본문의 뜻풀이·저장 안내가 남지 않게 합니다. */}
      <DiaryCard key={JSON.stringify([diary.text, diary.dialectWords])} diary={diary} savedWords={savedWords} />
      <section className={styles.evidenceSection} aria-label="일기의 근거">
        <button type="button" className="evidence-toggle" aria-expanded={evidenceOpen}
          aria-controls={evidenceId} onClick={() => setEvidenceOpen(!evidenceOpen)}>
          <span>이 일기의 근거</span><span>{evidenceOpen ? "접기" : "펼치기"}</span>
        </button>
        {evidenceOpen && <Evidence id={evidenceId} diary={diary} tree={tree} />}
      </section>
      {related.map((item) => <Card key={item.id} href={getDiaryHref(item)} className={styles.related}>
        <span className="caption">{item.isSpecial ? "이번 주 특별 소식" : "이번 주 성장 일기"}</span>
        <span className="link-more">{item.title}</span>
      </Card>)}
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
          : <PhotoPlaceholder aria-label="아직 나무 사진이 올라오지 않았어요." />}
      </div>
      {photo?.type === "orchard" && <figcaption className={`caption ${styles.photoCaption}`}>과수원 전체 모습</figcaption>}
    </figure>
  );
}

function Evidence({ id, diary, tree }) {
  const evidence = diary.evidence ?? {};
  const weather = evidence.weather ?? {};
  const number = (value, unit) => Number.isFinite(value) ? `${value}${unit}` : "기록 없음";
  const scope = diary.photo?.type === "orchard" ? "과수원 전체 기준" : "내 나무 기준";
  const adjusted = isStageAdjusted(diary, tree);
  const fields = [
    ...(adjusted ? [
      ["화면 표시 단계", getDiaryStage(diary, tree)],
      ["표시 기준", diary.displayStage ? "생육 시기를 고려해 사람이 보정한 게시용 표시예요. AI가 출력한 결과가 아니에요."
        : "수확까지 남은 기간에 따른 시기 표현이에요. AI 판정이 아니에요."],
    ] : []),
    [adjusted ? `AI 사진 판정 원본 (${scope})` : `생육 단계 (${scope})`, evidence.growthStage ?? "판단 불가"],
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
  if (week === null) return <Button variant="secondary" className="is-locked" disabled>{direction} 주</Button>;
  return <Button href={`/diary/${week}`} variant="secondary"
    aria-label={`${direction} 주, ${week}주차 일기`}>{direction} 주 · {week}주차</Button>;
}
