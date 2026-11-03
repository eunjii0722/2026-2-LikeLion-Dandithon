"use client";

import { useState } from "react";
import Image from "next/image";
import { StageIcon } from "@/components/common/Icons";
import TabBar from "@/components/common/TabBar";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import SeasonCard from "@/components/common/SeasonCard";
import PhotoPlaceholder from "@/components/common/PhotoPlaceholder";
import {
  SEASON_NAMES, STAGE_DESCRIPTIONS, getDiaryHref, seasonOfWeek,
} from "@/lib/data";
import styles from "./Home.module.css";

export default function HomeView({ tree, diary }) {
  const season = tree ? seasonOfWeek(tree.currentWeek) : "spring";
  const currentDiary = diary?.week === tree?.currentWeek ? diary : null;

  return (
    <div className={`app-shell ${styles.shell}`} data-season={season}>
      <header className="page-header">
        <div>
          <p className={`caption ${styles.noMargin}`}>
            {tree ? `${tree.farm.region} · ${tree.farm.name}` : "내 사과나무 1년"}
          </p>
          <h1 className="title">나의 사과나무</h1>
        </div>
      </header>

      <main className="app-content">
        {tree ? (
          <>
            <TreeOverview tree={tree} diary={currentDiary} season={season} />
            <DiaryPreview diary={diary} />
            <div className={`btn-row ${styles.actions}`}>
              <Button href="/letter" variant="secondary">편지 쓰기</Button>
              <Button href="/chat">나무에게 묻기</Button>
            </div>
          </>
        ) : <EmptyHome />}
      </main>

      {tree && <TabBar currentWeek={tree.currentWeek} />}
    </div>
  );
}

function EmptyHome() {
  return (
    <>
      <section aria-labelledby="empty-tree-title">
        <SeasonCard className={styles.emptyCard}>
          <p className={`caption ${styles.noMargin}`}>나무 한 그루와 함께하는 사계절</p>
          <h2 id="empty-tree-title" className={`tree-name ${styles.noMargin}`}>
            아직 분양받은 나무가 없어요
          </h2>
          <p className={styles.noMargin}>
            1년을 함께할 사과나무를 골라 보세요.<br />
            나무의 소식을 일기로 만나고,<br />가을에는 사과를 받아요.
          </p>
          <Button href="/trees" block>나무 고르러 가기</Button>
        </SeasonCard>
      </section>
      <p className="info-card">나무를 분양받으면 이곳에서 사진과 최근 성장 일기, 성장 상태를 볼 수 있어요.</p>
    </>
  );
}

function TreeOverview({ tree, diary, season }) {
  const stage = diary?.evidence?.growthStage ?? "판단 불가";
  const currentWeek = tree.currentWeek;
  const weeksToHarvest = Math.max(0, tree.harvestWeek - currentWeek);
  const photo = diary?.photo?.url ? diary.photo : { url: tree.photo, type: "tree" };

  return (
    <section aria-labelledby="home-tree-name">
      <SeasonCard season={season} className={styles.treeCard}>
        <TreePhoto key={photo.url ?? "placeholder"} photo={photo} treeName={tree.name} />
        <div className={styles.treeDetails}>
          <div className={styles.treeInfo}>
            <h2 id="home-tree-name" className={`tree-name ${styles.noMargin}`}>{tree.name}</h2>
            <p className={`${styles.stageLine} ${styles.noMargin}`}>
              <StageIcon stage={stage} size={22} />
              <span>{SEASON_NAMES[season]} · {currentWeek}주차</span>
            </p>
            <p className={styles.noMargin}>{diary
              ? STAGE_DESCRIPTIONS[stage] ?? "성장 단계를 판단하기 어려워요."
              : "새로운 성장 소식을 기다리고 있어요."}</p>
          </div>
          <div className={styles.harvest}>
            <span>수확까지</span>
            <strong className="big-number">{weeksToHarvest}주</strong>
          </div>
        </div>
        {diary && (
          <p className={`caption ${styles.noMargin}`}>
            {diary.week}주차 기록 · {diary.photo?.type === "orchard" ? "과수원 전체 기준" : "내 나무 기준"}
            {typeof diary.evidence?.farmerConfirmed === "boolean"
              && ` · ${diary.evidence.farmerConfirmed ? "농부 확인" : "AI 사진 분석"}`}
          </p>
        )}
      </SeasonCard>
    </section>
  );
}

function TreePhoto({ photo, treeName }) {
  const [failed, setFailed] = useState(false);
  if (!photo.url || failed) {
    return <PhotoPlaceholder className={styles.photo} aria-label="나무 사진 준비 중">나무 사진 준비 중</PhotoPlaceholder>;
  }
  const label = photo.type === "orchard" ? "과수원 전체 모습" : `${treeName}의 모습`;
  return (
    <figure className={styles.noMargin}>
      <Image src={photo.url} alt={label} width={780} height={585}
        className={styles.photo} unoptimized onError={() => setFailed(true)} />
      <figcaption className={`caption ${styles.photoCaption}`}>{label}</figcaption>
    </figure>
  );
}

function DiaryPreview({ diary }) {
  if (!diary) {
    return (
      <section className="card-diary" aria-labelledby="waiting-diary-title">
        <h2 id="waiting-diary-title" className="diary-title">첫 일기를 기다리고 있어요</h2>
        <p className="diary-text">나무의 소식이 도착하면 여기에서 알려드릴게요.</p>
      </section>
    );
  }
  return (
    <Card href={getDiaryHref(diary)} variant="diary"
      aria-label={`${diary.week}주차 일기, ${diary.title} 읽기`}>
      <div className="card-label-row">
        <span>최근 나무 일기</span><span>{diary.week}주차 · {SEASON_NAMES[diary.season]}</span>
      </div>
      <TreePhoto key={diary.photo.url ?? "placeholder"} photo={diary.photo} treeName="나무" />
      <h2 className="diary-title">{diary.title}</h2>
      <p className={`diary-text ${styles.diaryPreview}`}>{diary.text}</p>
      <span className="link-more">일기 읽기</span>
    </Card>
  );
}
