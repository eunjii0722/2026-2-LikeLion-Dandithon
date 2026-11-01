const VARIANT_CLASS = {
    default : "btn-icon",
    plain : "btn-back",
    send : "btn-send",
};

export default function IconButton({
    label,
    variant = "default",
    className = "",
    children,
    ...rest
}) {
    if(!label && process.env.NODE_ENV !== "production") {
        console.warn("IconButton: label(aria-label)이 필요합니다.");
    }

    const classes = [VARIANT_CLASS[variant] ?? VARIANT_CLASS.default, className]
    .filter(Boolean)
    .join(" ");

    return (
        <button type="button" aria-label={label} className={classes} {...rest}>
            {children}
        </button>
    );
}