/* 나무 목록의 카드 하나: 누르면 /trees/[id] 프로필로 이동 */

import Link from "next/link";
import styles from "./Tree.module.css";

export default function TreeCard({ tree }) {
  return (
    <Link href={`/trees/${tree.id}`} className={`card ${styles.treeCard}`}>
      {tree.photo ? (
        <img className={styles.thumb} src={tree.photo} alt="" />
      ) : (
        <span className={`photo-placeholder ${styles.thumb}`} aria-hidden="true">
          나무 사진
        </span>
      )}
      <span className={styles.info}>
        <span className="tree-name">{tree.name}</span>
        <span className="caption">
          {tree.variety} · {tree.farm.name}
        </span>
        <span className="caption">{tree.farm.region} 출신</span>
      </span>
    </Link>
  );
}
