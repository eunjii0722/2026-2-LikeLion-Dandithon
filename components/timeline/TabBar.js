/* =========================================================
   [임시] 하단 메뉴
   ---------------------------------------------------------
   공통 하단 메뉴(C 담당, components/common)가 올라오면
   이 파일을 지우고 그쪽으로 바꿉니다.
   - current: "home" | "timeline" | "diary" | "album"
   - diaryWeek: "일기" 메뉴가 열 주차 (보통 이번 주)
   ========================================================= */

import Link from "next/link";
import { IconHome, IconTimeline, IconDiary, IconAlbum } from "@/components/common/Icons";

export default function TabBar({ current, diaryWeek }) {
  const tabs = [
    { key: "home", label: "홈", href: "/", Icon: IconHome },
    { key: "timeline", label: "타임라인", href: "/timeline", Icon: IconTimeline },
    { key: "diary", label: "일기", href: `/diary/${diaryWeek}`, Icon: IconDiary },
    { key: "album", label: "앨범", href: "/harvest", Icon: IconAlbum },
  ];

  return (
    <nav className="tab-bar" aria-label="주요 메뉴">
      {tabs.map(({ key, label, href, Icon }) => (
        <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}
