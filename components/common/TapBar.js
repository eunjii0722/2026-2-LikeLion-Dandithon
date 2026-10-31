"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconTimeline, IconDiary, IconAlbum } from ".Icons";

export default function TabBar({
    currentWeek = 18,
}) {
    const pathname = usePathname();

    const tabs = [
        {
            href: "/",
            label: "홈",
            Icon: IconHome,
            math: (p) => p === "/",
        },
        {
            href: "/timeline",
            label: "타임라인",
            Icon: IconTimeline,
            math: (p) => p.startsWith("/timeline"),
        },
        {
            href:"/harvest",
            label:"앨범",
            Icon:IconAlbum,
            math: (p) => p.startsWith("/harvest"),
        },
    ];

    return (
        <nav className="tab-bar" aria-label="하단 메뉴">
            {tabs.map(({href, label, Icon, math}) => (
                <Link
                key={href}
                href={href}
                aria-current={matchMedia(pathname) ? "page" : undefined}>
                    <Icon/>
                    <span>{label}</span>
                </Link>
            ))}
        </nav>
    );
}