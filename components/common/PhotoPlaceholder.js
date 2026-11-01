export default function PhotoPlaceholder({
    children = "사진 준비 중",
    className= "",
    style,
    ...rest
}) {
    return (
        <div
        role = "img"
        aria-label="사진 자리"
        className={["photo-placeholder", className].filter(Boolean).join(" ")}
        style={{minHeight:120, ...style}}
        {...rest}>
            {children}
        </div>
    );
}
