"use client";

/* =========================================================
   성장 타임라인 화면 본문
   ---------------------------------------------------------
   고른 나무 id가 브라우저 저장소에 있어서 화면이 뜬 뒤 읽음 (공통 안내 5-1).
   - 지난 주·이번 주: mergeDiaries(treeId, generatedDiaries) (JSON 일기 + 농부 화면에서 새로 만든 일기)
   - 아직 오지 않은 주: 앞으로 올 계절마다 첫 주 한 칸 + 수확 주
     (공통 데이터에 예고 필드가 없어서 주차를 달로 바꿔 계절을 계산)
   ========================================================= */

import { useSyncExternalStore } from "react";
import SeasonGroup from "./SeasonGroup";
import TabBar from "@/components/common/TabBar";
import NoTreeSelected from "@/components/tree/NoTreeSelected";
import { getDiaryHref, getTree, mergeDiaries, STAGE_DESCRIPTIONS } from "@/lib/data";
import { getDiaryStorageSnapshot, subscribeToDiary } from "@/lib/storage";

const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];
const getServerSnapshot = () => null;

/* 아직 오지 않은 계절 칸의 예고 단계 (봄 개화 → 여름 성장 → 가을 수확) */
const UPCOMING_STAGE = { spring: "개화", summer: "성장", autumn: "수확", winter: "휴면" };

/* 1년 중 몇째 주인지로 계절 정하기 (3~5월 봄, 6~8월 여름, 9~11월 가을) */
function seasonOfWeek(week) {
  const month = Math.min(12, Math.floor(((week - 1) * 7) / 30.44) + 1);
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/* "판단 불가"나 비어 있는 단계는 보여주지 않음 */
function stageLabel(growthStage) {
  return Object.hasOwn(STAGE_DESCRIPTIONS, growthStage) ? growthStage : null;
}

function buildGroups(tree, diaries) {
  const { name, currentWeek, harvestWeek } = tree;

  const openItems = diaries
    .filter((diary) => diary.week <= currentWeek)
    .map((diary) => ({
      key: diary.id,
      week: diary.week,
      season: diary.season,
      stage: stageLabel(diary.evidence.growthStage),
      headline: diary.title,
      photoUrl: diary.photo.url,
      href: getDiaryHref(diary),
      isSpecial: diary.isSpecial,
      isCurrent: diary.week === currentWeek && !diary.isSpecial,
      isLocked: false,
    }));

  // 아직 오지 않은 계절마다 첫 주 한 칸. 수확 주가 있는 계절은 수확 주로 대신함
  const lockedItems = [];
  const harvestSeason = seasonOfWeek(harvestWeek);
  for (let week = currentWeek + 1; week <= harvestWeek; week++) {
    const season = seasonOfWeek(week);
    if (season === seasonOfWeek(currentWeek) || season === harvestSeason) continue;
    if (lockedItems.some((item) => item.season === season)) continue;
    lockedItems.push({
      key: `locked-${week}`,
      week,
      season,
      stage: UPCOMING_STAGE[season],
      headline: "그 주가 되면 일기가 열려요",
    });
  }
  if (harvestWeek > currentWeek) {
    lockedItems.push({
      key: `locked-${harvestWeek}`,
      week: harvestWeek,
      season: harvestSeason,
      stage: "수확",
      headline: `${name}의 사과가 집으로 와요`,
    });
  }

  // mergeDiaries가 이미 주차·특별 소식 순으로 정렬해 주므로 잠긴 칸만 끼워 넣음
  const items = [...openItems, ...lockedItems.map((item) => ({ ...item, isLocked: true }))].sort(
    (a, b) => a.week - b.week,
  );

  return SEASON_ORDER.map((season) => ({
    season,
    items: items.filter((item) => item.season === season),
  })).filter((group) => group.items.length > 0);
}

export default function TimelineView() {
  const snapshot = useSyncExternalStore(subscribeToDiary, getDiaryStorageSnapshot, getServerSnapshot);

  if (snapshot === null) {
    return (
      <div className="app-shell">
        <p className="status-message app-content" role="status">
          불러오는 중...
        </p>
      </div>
    );
  }

  const { treeId, generatedDiaries } = JSON.parse(snapshot);
  const tree = getTree(treeId);
  if (!tree) return <NoTreeSelected title="성장 타임라인" />;

  const { name, startWeek, currentWeek, harvestWeek } = tree;
  const progress = Math.min(
    100,
    Math.max(0, Math.round(((currentWeek - startWeek) / (harvestWeek - startWeek)) * 100)),
  );
  const groups = buildGroups(tree, mergeDiaries(tree.id, generatedDiaries));

  return (
    <div className="app-shell" data-season={seasonOfWeek(currentWeek)}>
      <header className="page-header">
        <h1 className="title">{name}의 1년</h1>
      </header>

      <main className="app-content">
        <div>
          <div
            className="progress"
            role="progressbar"
            aria-label="수확까지 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            style={{ "--progress": `${progress}%` }}
          >
            <div className="progress-fill" />
          </div>
          <p className="progress-caption">
            <span>{currentWeek - startWeek}주 함께함</span>
            <span>수확까지 {harvestWeek - currentWeek}주</span>
          </p>
        </div>

        {groups.map((group) => (
          <SeasonGroup key={group.season} season={group.season} items={group.items} />
        ))}
      </main>

      <TabBar currentWeek={currentWeek} />
    </div>
  );
}
