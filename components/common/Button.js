import Link from "next/link";

export default function Button({
    variant = "primary",
    href,
    block = false,
    small = false,
    className = "",
    children,
    ...rest
}) {
    const classes = [
        "btn",
        variant === "secondary" ? "btn-secondary" : "btn-primary",
        block ? "btn-block" : "",
        small ? "btn-sm" : "",
        className,
    ]
    .filter(Boolean)
    .join(" ");

    if(href){
        return (
            <Link href={href} className={classes} {...rest}>
                {children}
            </Link>
        );
    }

    return (
        <button type="button" className={classes} {...rest}>
            {children}
        </button>
    );
}