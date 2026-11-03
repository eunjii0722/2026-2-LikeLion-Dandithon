export default function PhotoPlaceholder({
    children = "아직 나무 사진이 올라오지 않았어요.",
    className= "",
    style,
    ...rest
}) {
    return (
        <div
        role = "img"
        aria-label="사진 자리"
        className={["photo-placeholder", className].filter(Boolean).join(" ")}
        style={{minHeight:120, textAlign:"center", ...style}}
        {...rest}>
            {children}
        </div>
    );
}
