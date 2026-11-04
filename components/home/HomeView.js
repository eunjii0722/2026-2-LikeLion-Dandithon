"use client";

import { useRef, useState } from "react";
import { initializeDemo } from "../../public/demo/initialize.js";
import Image from "next/image";
import { StageIcon } from "@/components/common/Icons";
import TabBar from "@/components/common/TabBar";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import SeasonCard from "@/components/common/SeasonCard";
import PhotoPlaceholder from "@/components/common/PhotoPlaceholder";
import {
  HARVEST_SOON_STAGE, SEASON_NAMES, STAGE_DESCRIPTIONS, getDiaryHref, getDiaryStage, getPlannedStage, isStageAdjusted, seasonOfWeek,
} from "@/lib/data";
import styles from "./Home.module.css";

export default function HomeView({ tree, diary, adoptionWeeks = 0 }) {
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
            <TreeOverview tree={tree} diary={currentDiary} hasDiaries={Boolean(diary)} season={season} adoptionWeeks={adoptionWeeks} />
            <DiaryPreview diary={diary} tree={tree} />
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
  const pending = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleBrowse() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await initializeDemo();
      // 초기화의 storage-change 알림을 HomeClient가 구독하므로 성공 즉시 홈을 다시 읽습니다.
      if (!result.ok) setError(result.existingKeys?.length
        ? "이 브라우저에는 기존 기록이 있어요. 별도의 브라우저 프로필에서 둘러보기를 이용해 주세요."
        : result.reason || "성장 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } catch {
      setError("성장 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

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
          <div className={styles.browse}>
            <Button variant="secondary" block className={styles.browseButton}
              onClick={handleBrowse} disabled={loading} aria-describedby="browse-description">
              홍이의 성장 기록 둘러보기
            </Button>
            <p id="browse-description" className={`caption ${styles.noMargin}`}>
              미리 준비된 예시 기록으로 사계절의<br />성장 과정을 체험할 수 있어요.
            </p>
            {loading && <p className={`caption ${styles.noMargin}`} role="status">성장 기록을 불러오는 중이에요.</p>}
            {error && <p className={`error-message ${styles.noMargin}`} role="alert">{error}</p>}
          </div>
        </SeasonCard>
      </section>
      <p className="info-card">나무를 분양받으면 이곳에서 사진과 최근 성장 일기, 성장 상태를 볼 수 있어요.</p>
    </>
  );
}

function TreeOverview({ tree, diary, hasDiaries, season, adoptionWeeks }) {
  const stage = diary ? getDiaryStage(diary, tree) : getPlannedStage(tree);
  const currentWeek = tree.currentWeek;
  const weeksToHarvest = Math.max(0, tree.harvestWeek - currentWeek);
  // 이번 주 성장 기록의 사진만 씁니다. 지난 주 사진은 아래 일기 카드에, tree.photo는 분양 소개에만 씁니다.
  const photo = diary?.photo?.url ? diary.photo : { url: null, type: "tree" };

  return (
    <section aria-labelledby="home-tree-name">
      <SeasonCard season={season} className={styles.treeCard}>
        <TreePhoto key={photo.url ?? "placeholder"} photo={photo} treeName={tree.name}
          emptyText={hasDiaries ? `${currentWeek}주차 사진이 아직 도착하지 않았어요.` : undefined}
          emptyNote={hasDiaries && !diary ? "이번 주 새로운 소식을 기다리고 있어요." : null} />
        <div className={styles.treeDetails}>
          <div className={styles.treeInfo}>
            <h2 id="home-tree-name" className={`tree-name ${styles.noMargin}`}>{tree.name}</h2>
            <p className={`${styles.stageLine} ${styles.noMargin}`}>
              <StageIcon stage={stage ?? "판단 불가"} size={22} />
              <span>{SEASON_NAMES[season]} · 생육 {currentWeek}주차{stage && <span style={{ whiteSpace: "nowrap" }}> · {stage}</span>}</span>
            </p>
            <p className={styles.noMargin}>함께한 기간 {adoptionWeeks}주차</p>
            <p className={styles.noMargin}>{stage === HARVEST_SOON_STAGE
              ? "수확이 얼마 남지 않았어요."
              : diary ? STAGE_DESCRIPTIONS[stage] ?? "성장 단계를 판단하기 어려워요."
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
            {isStageAdjusted(diary, tree) && <span style={{ whiteSpace: "nowrap" }}> · AI 판정 {diary.evidence.growthStage ?? "판단 불가"}</span>}
          </p>
        )}
      </SeasonCard>
    </section>
  );
}

function TreePhoto({ photo, treeName, emptyText = `아직 ${treeName}의 사진이 도착하지 않았어요.`, emptyNote = null }) {
  const [failed, setFailed] = useState(false);
  if (!photo.url || failed) {
    return (
      <PhotoPlaceholder className={styles.photo} aria-label={emptyNote ? `${emptyText} ${emptyNote}` : emptyText}>
        <span>{emptyText}{emptyNote && <><br />{emptyNote}</>}</span>
      </PhotoPlaceholder>
    );
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

function DiaryPreview({ diary, tree }) {
  if (!diary) {
    return (
      <section className="card-diary" aria-labelledby="waiting-diary-title">
        <h2 id="waiting-diary-title" className="diary-title">첫 일기를 기다리고 있어요</h2>
        <p className="diary-text">나무의 소식이 도착하면 여기에서 알려드릴게요.</p>
      </section>
    );
  }
  const stage = getDiaryStage(diary, tree);
  return (
    <Card href={getDiaryHref(diary)} variant="diary"
      aria-label={`${diary.week}주차 일기, ${diary.title} 읽기`}>
      <div className="card-label-row">
        <span>최근 나무 일기</span><span>{diary.week}주차 · {SEASON_NAMES[diary.season]}{stage && ` · ${stage}`}</span>
      </div>
      <TreePhoto key={diary.photo.url ?? "placeholder"} photo={diary.photo} treeName={tree.name} />
      <h2 className="diary-title">{diary.title}</h2>
      <p className={`diary-text ${styles.diaryPreview}`}>{diary.text}</p>
      <span className="link-more">일기 읽기</span>
    </Card>
  );
}
