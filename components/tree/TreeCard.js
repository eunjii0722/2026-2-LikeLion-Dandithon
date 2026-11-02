/* 나무 목록의 카드 하나: 누르면 /trees/[id] 프로필로 이동 */

import Card from "@/components/common/Card";
import PhotoPlaceholder from "@/components/common/PhotoPlaceholder";
import styles from "./Tree.module.css";

export default function TreeCard({ tree }) {
  return (
    <Card href={`/trees/${tree.id}`} className={styles.treeCard}>
      {tree.photo ? (
        <img className={styles.thumb} src={tree.photo} alt="" />
      ) : (
        <PhotoPlaceholder className={styles.thumb} style={{ minHeight: 0 }} aria-hidden="true">
          나무 사진
        </PhotoPlaceholder>
      )}
      <span className={styles.info}>
        <span className="tree-name">{tree.name}</span>
        <span className="caption">
          {tree.variety} · {tree.farm.name}
        </span>
        <span className="caption">{tree.farm.region} 출신</span>
      </span>
    </Card>
  );
}
