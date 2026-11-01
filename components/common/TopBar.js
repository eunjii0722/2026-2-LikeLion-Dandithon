"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import IconButton from "./IconButton";
import { IconBack } from "./Icons";

export default function TopBar({
    title,
    backHref,
    className="",
}) {
    const router = useRouter();

    return(
        <header className={["top-bar", className].filter(Boolean).join(" ")}>
            {backHref ? (
                <Link href={backHref} className="btn-back" aria-label="뒤로">
                    <IconBack/>
                </Link>
            ) : (
                <IconButton label="뒤로" variant="plain" onClick={() => router.back()}>
                    <IconBack/>
                </IconButton>
            )}
            <h1 style={{margin:0, font:"inherit"}}>{title}</h1>
        </header>
    );
}