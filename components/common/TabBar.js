"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconTimeline, IconDiary, IconAlbum } from "./Icons";

export default function TabBar({
    currentWeek = 18,
}) {
    const pathname = usePathname();

    const tabs = [
        {
            href: "/",
            label: "홈",
            Icon: IconHome,
            match: (p) => p === "/",
        },
        {
            href: "/timeline",
            label: "타임라인",
            Icon: IconTimeline,
            match: (p) => p === "/timeline" || p?.startsWith("/timeline/"),
        },
        {
            href: `/diary/${currentWeek}`,
            label: "일기",
            Icon: IconDiary,
            match: (p) => p === "/diary" || p?.startsWith("/diary/"),
        },
        {
            href:"/harvest",
            label:"앨범",
            Icon:IconAlbum,
            match: (p) => p === "/harvest" || p?.startsWith("/harvest/"),
        },
    ];

    return (
        <nav className="tab-bar" aria-label="하단 메뉴">
            {tabs.map(({href, label, Icon, match}) => (
                <Link
                key={href}
                href={href}
                aria-current={match(pathname) ? "page" : undefined}>
                    <Icon/>
                    <span>{label}</span>
                </Link>
            ))}
        </nav>
    );
}
