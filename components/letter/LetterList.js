import Card from "@/components/common/Card";

export default function LetterList({letters}) {
    const sorted = [...letters].sort((a,b) => 
        String(b.createdAt).localeCompare(String(a.createdAt))
    );

    if(sorted.length==0){
        return <p className="status-message">아직 보낸 편지가 없어요.</p>
    }

    return (
        <section aria-label="보낸 편지 목록">
            <h2 className="caption">보낸 편지</h2> 
            {sorted.map((letter) => (
                <Card key={letter.id}>
                    <p className="caption">
                        {`${letter.week}주차 · ${new Date(letter.createdAt).toLocaleDateString("ko-KR")}${letter.usedInDiaryId ? " · 답장 받음" : ""}`}
                    </p>
                    <p className="diary-text" style={{ overflowWrap: "anywhere" }}>{letter.text}</p>
                </Card>
            ))}
        </section>
    );
}
