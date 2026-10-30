/* =========================================================
   타임라인의 계절 묶음 하나 (봄 / 여름 · 기다리는 중 ...)
   ---------------------------------------------------------
   items: { key, week, stage, headline, photoUrl, isSpecial, isCurrent, isLocked }
   - 지난 주·이번 주: 누르면 그 주 일기(/diary/[week])로 이동
   - 아직 오지 않은 주: 자물쇠와 예고 문구만 보여줌
   - 묶음 안의 주가 모두 잠겨 있으면 연한 계절 색(is-waiting)
   ========================================================= */

import Link from "next/link";
import { IconLock } from "@/components/common/Icons";
import styles from "./Timeline.module.css";

const SEASON_LABELS = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};

export default function SeasonGroup({ season, items }) {
  const isWaiting = items.every((item) => item.isLocked);
  const title = isWaiting ? `${SEASON_LABELS[season]} · 기다리는 중` : SEASON_LABELS[season];

  return (
    <section className={`season-group${isWaiting ? " is-waiting" : ""}`} data-group={season}>
      <h2 className="season-group-title">{title}</h2>
      {items.map((item) =>
        item.isLocked ? (
          <LockedWeek key={item.key} item={item} />
        ) : (
          <OpenWeek key={item.key} item={item} isCurrent={item.isCurrent} />
        ),
      )}
    </section>
  );
}

function OpenWeek({ item, isCurrent }) {
  return (
    <Link
      href={`/diary/${item.week}`}
      className={`timeline-item${isCurrent ? " is-current" : ""}`}
      aria-current={isCurrent ? "true" : undefined}
    >
      {item.photoUrl ? (
        <img className="timeline-thumb" src={item.photoUrl} alt="" />
      ) : (
        <span className="timeline-thumb photo-placeholder" aria-hidden="true" />
      )}
      <span className={styles.itemText}>
        <span className="timeline-week">
          {item.week}주차 · {item.stage}
          {isCurrent && " · 이번 주"}
        </span>
        <span className="timeline-headline">{item.headline}</span>
        {item.isSpecial && <span className={styles.special}>특별 소식</span>}
      </span>
    </Link>
  );
}

function LockedWeek({ item }) {
  return (
    <div className="timeline-item is-locked">
      <span className="timeline-thumb">
        <IconLock />
      </span>
      <span className={styles.itemText}>
        <span className="timeline-week">
          약 {item.week}주차{item.stage && ` · ${item.stage} 예정`}
        </span>
        <span className="timeline-headline">{item.headline}</span>
      </span>
    </div>
  );
}
