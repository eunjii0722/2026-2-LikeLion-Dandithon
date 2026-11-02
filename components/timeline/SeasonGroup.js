/* =========================================================
   타임라인의 계절 묶음 하나 (봄 / 여름 · 기다리는 중 ...)
   ---------------------------------------------------------
   items: { key, week, stage, headline, photoUrl, href, isSpecial, isCurrent, isLocked }
   - 지난 주·이번 주: 누르면 그 일기(href)로 이동
   - 아직 오지 않은 주: 자물쇠와 예고 문구만 보여줌
   - 묶음 안의 주가 모두 잠겨 있으면 연한 계절 색(is-waiting)
   ========================================================= */

import Link from "next/link";
import PhotoPlaceholder from "@/components/common/PhotoPlaceholder";
import { IconLock } from "@/components/common/Icons";
import { SEASON_NAMES } from "@/lib/data";
import styles from "./Timeline.module.css";

export default function SeasonGroup({ season, items }) {
  const isWaiting = items.every((item) => item.isLocked);
  const title = isWaiting ? `${SEASON_NAMES[season]} · 기다리는 중` : SEASON_NAMES[season];

  return (
    <section className={`season-group${isWaiting ? " is-waiting" : ""}`} data-group={season}>
      <h2 className="season-group-title">{title}</h2>
      {items.map((item) =>
        item.isLocked ? <LockedWeek key={item.key} item={item} /> : <OpenWeek key={item.key} item={item} />,
      )}
    </section>
  );
}

function OpenWeek({ item }) {
  return (
    <Link
      href={item.href}
      className={`timeline-item${item.isCurrent ? " is-current" : ""}`}
      aria-current={item.isCurrent ? "true" : undefined}
    >
      {item.photoUrl ? (
        <img className="timeline-thumb" src={item.photoUrl} alt="" />
      ) : (
        <PhotoPlaceholder className="timeline-thumb" style={{ minHeight: 0 }} aria-hidden="true">
          {""}
        </PhotoPlaceholder>
      )}
      <span className={styles.itemText}>
        <span className="timeline-week">
          {item.week}주차
          {item.stage && ` · ${item.stage}`}
          {item.isCurrent && " · 이번 주"}
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
