import Link from "next/link";

export default function Card({
    variant = "default",
    href,
    className="",
    children,
    ...rest
}) {
    const classes = [variant === "diary" ? "card-diary" : "card", className]
    .filter(Boolean)
    .join(" ");

    if(href) {
        return (
            <Link href={href} className={classes} {...rest}>
                {children}
            </Link>
        );
    }

    return (
        <div className={classes} {...rest}>
            {children}
        </div>
    );
}