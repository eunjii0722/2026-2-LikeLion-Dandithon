"use client";

/* =========================================================
   수확 앨범 화면 본문
   ---------------------------------------------------------
   - 머리: 수확 여부, "[이름]와 함께한 1년", 함께한 주·일기·편지 수
   - 폴라로이드: 계절마다 대표 일기 사진 한 장, 사이사이에
     내가 보낸 편지 한 줄(getLetters)과 모은 사투리(getSavedWords)
   - QR 안내 + 사과 받을 주소 입력 (시연용 가짜 폼)
   ========================================================= */

import AddressForm from "./AddressForm";
import styles from "./Harvest.module.css";
import TabBar from "@/components/timeline/TabBar";
import NoTreeSelected from "@/components/tree/NoTreeSelected";
import { withWa } from "@/components/tree/josa";
import useSelectedTreeId from "@/components/tree/useSelectedTreeId";
import { getTree } from "@/components/tree/tempData";
import { getAllDiaries, getLetters, getSavedWords } from "@/components/tree/tempStorage";
import { IconQr } from "@/components/common/Icons";

const SEASONS = [
  { key: "spring", label: "봄" },
  { key: "summer", label: "여름" },
  { key: "autumn", label: "가을" },
  { key: "winter", label: "겨울" },
];

const LETTER_MAX_LENGTH = 40;

/* 계절마다 그 계절의 마지막 정기 일기를 대표 사진으로 */
function pickSeasonPhotos(diaries) {
  return SEASONS.flatMap(({ key, label }) => {
    const diary = diaries
      .filter((item) => item.season === key && !item.isSpecial)
      .sort((a, b) => a.week - b.week)
      .at(-1);
    return diary ? [{ type: "photo", key: diary.id, season: key, seasonLabel: label, diary }] : [];
  });
}

/* 사진 사이사이에 편지·사투리를 하나씩 끼워 넣기 */
function interleave(photos, extras) {
  const result = [];
  const length = Math.max(photos.length, extras.length);
  for (let i = 0; i < length; i++) {
    if (photos[i]) result.push(photos[i]);
    if (extras[i]) result.push(extras[i]);
  }
  return result;
}

function shorten(text) {
  return text.length > LETTER_MAX_LENGTH ? `${text.slice(0, LETTER_MAX_LENGTH)}…` : text;
}

export default function HarvestAlbum() {
  const treeId = useSelectedTreeId();

  if (treeId === undefined) {
    return (
      <div className="app-shell">
        <p className="status-message app-content" role="status">
          불러오는 중...
        </p>
      </div>
    );
  }

  const tree = getTree(treeId);
  if (!tree) return <NoTreeSelected title="수확 앨범" />;

  const diaries = getAllDiaries(tree.id);
  const letters = getLetters().filter((letter) => letter.treeId === tree.id);
  const words = getSavedWords();
  const isHarvested = tree.currentWeek >= tree.harvestWeek;

  const extras = [
    ...letters.map((letter) => ({ type: "letter", key: letter.id, letter })),
    ...words.map((word, index) => ({ type: "word", key: `word-${index}`, word })),
  ];
  const cards = interleave(pickSeasonPhotos(diaries), extras);

  return (
    <div className="app-shell" data-season="autumn">
      <header className="album-header">
        <p className="caption" style={{ margin: 0 }}>
          {isHarvested ? "수확 완료" : `수확까지 ${tree.harvestWeek - tree.currentWeek}주`}
        </p>
        <h1 className="album-title">{withWa(tree.name)} 함께한 1년</h1>
        <p className="album-stats" style={{ margin: 0 }}>
          <span>{tree.currentWeek - tree.startWeek}주</span>
          <span>일기 {diaries.length}편</span>
          <span>편지 {letters.length}통</span>
        </p>
      </header>

      <main className={`app-content ${styles.content}`}>
        {cards.length > 0 ? (
          <div className="polaroid-grid">
            {cards.map((card) => (
              <AlbumCard key={card.key} card={card} />
            ))}
          </div>
        ) : (
          <p className="caption">일기가 쌓이면 여기에 사진이 모여요.</p>
        )}

        <div className="info-card">
          <IconQr />
          <span>사과 상자 속 QR로 이 앨범을 다시 열 수 있어요</span>
        </div>

        <AddressForm treeName={tree.name} />
      </main>

      <TabBar current="album" diaryWeek={tree.currentWeek} />
    </div>
  );
}

function AlbumCard({ card }) {
  if (card.type === "letter") {
    return (
      <figure className="polaroid">
        <p className="polaroid-photo polaroid-letter" style={{ margin: 0 }}>
          “{shorten(card.letter.text)}”
        </p>
        <figcaption className="polaroid-caption">내가 보낸 편지</figcaption>
      </figure>
    );
  }

  if (card.type === "word") {
    return (
      <figure className="polaroid">
        <p className="polaroid-photo polaroid-letter" style={{ margin: 0 }}>
          {card.word.word}
          <br />
          {card.word.meaning}
        </p>
        <figcaption className="polaroid-caption">모은 사투리</figcaption>
      </figure>
    );
  }

  const { diary, season, seasonLabel } = card;
  return (
    <figure className="polaroid">
      {diary.photo?.url ? (
        <img className="polaroid-photo" src={diary.photo.url} alt={`${seasonLabel} 사진`} />
      ) : (
        <span className="polaroid-photo" style={{ background: `var(--season-${season})` }}>
          [{seasonLabel} 사진]
        </span>
      )}
      <figcaption className="polaroid-caption">
        {diary.week}주차 · {diary.title}
      </figcaption>
    </figure>
  );
}
