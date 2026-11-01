export default function SeasonCard({
    season = "spring",
    className="",
    children,
    ...rest
}) {
    return (
        <div data-season={season}
        className={["card-season", className].filter(Boolean).join(" ")}
        {...rest}>
            {children}
        </div>
    );
}