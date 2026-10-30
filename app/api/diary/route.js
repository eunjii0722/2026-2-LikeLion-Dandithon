export async function POST(request) {
  try {
    // Mock API: 프론트엔드 로딩 UI 확인을 위해 2초 기다립니다.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let body;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return Response.json(
          { error: "요청 본문은 올바른 JSON이어야 합니다." },
          { status: 400 },
        );
      }
      throw error;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json(
        { error: "요청 본문은 JSON 객체여야 합니다." },
        { status: 400 },
      );
    }

    const {
      treeId, week, photoType, vision, weather,
      farmerNote, farmerConfirmed, observedAt, letters,
    } = body;

    if (typeof treeId !== "string" || !treeId.trim()) {
      return Response.json(
        { error: "treeId는 비어 있지 않은 문자열이어야 합니다." },
        { status: 400 },
      );
    }
    if (!Number.isSafeInteger(week) || week < 1) {
      return Response.json(
        { error: "week는 1 이상의 정수여야 합니다." },
        { status: 400 },
      );
    }
    if (photoType !== "orchard" && photoType !== "tree") {
      return Response.json(
        { error: 'photoType은 "orchard" 또는 "tree"여야 합니다.' },
        { status: 400 },
      );
    }
    if (
      !vision || typeof vision !== "object" || Array.isArray(vision) ||
      !["휴면", "개화", "착과", "비대", "착색", "수확기", "판단 불가"].includes(vision.growth_stage) ||
      !["높음", "보통", "낮음"].includes(vision.confidence)
    ) {
      return Response.json(
        { error: "vision에는 유효한 growth_stage와 confidence가 필요합니다." },
        { status: 400 },
      );
    }
    if (
      !weather || typeof weather !== "object" || Array.isArray(weather) ||
      !Number.isFinite(weather.tempMax) ||
      !Number.isFinite(weather.tempMin) ||
      !Number.isFinite(weather.rainMm)
    ) {
      return Response.json(
        { error: "weather의 tempMax, tempMin, rainMm은 숫자여야 합니다." },
        { status: 400 },
      );
    }
    if (typeof farmerNote !== "string") {
      return Response.json(
        { error: "farmerNote는 문자열이어야 합니다. 메모가 없으면 빈 문자열을 보내 주세요." },
        { status: 400 },
      );
    }
    if (typeof farmerConfirmed !== "boolean") {
      return Response.json(
        { error: "farmerConfirmed는 true 또는 false여야 합니다." },
        { status: 400 },
      );
    }
    if (
      typeof observedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(observedAt) ||
      !Number.isFinite(Date.parse(observedAt)) ||
      new Date(observedAt).toISOString().slice(0, 10) !== observedAt
    ) {
      return Response.json(
        { error: "observedAt은 YYYY-MM-DD 형식의 유효한 날짜여야 합니다." },
        { status: 400 },
      );
    }
    if (!Array.isArray(letters) || !letters.every((letter) => typeof letter === "string")) {
      return Response.json(
        { error: "letters는 문자열 배열이어야 합니다. 편지가 없으면 빈 배열을 보내 주세요." },
        { status: 400 },
      );
    }

    // 검증된 관찰 날짜의 월로만 계절을 정합니다.
    const month = Number(observedAt.slice(5, 7));
    let season = "winter";
    if (month >= 3 && month <= 5) {
      season = "spring";
    } else if (month >= 6 && month <= 8) {
      season = "summer";
    } else if (month >= 9 && month <= 11) {
      season = "autumn";
    }

    // Mock 응답: 일기 문구는 고정이며, 사진 종류와 근거는 요청값을 그대로 사용합니다.
    return Response.json({
      id: `${treeId}-w${week}`,
      treeId,
      week,
      season,
      title: "이번 주 홍이의 이야기",
      text: "이번 주도 내 소식을 보러 왔나? 참 고맙데이. 오늘은 쪼매 이야기를 남겨 볼라꼬. 다음에도 또 만나자.",
      isSpecial: false,
      dialectWords: [{ word: "쪼매", meaning: "조금" }],
      photo: { url: null, type: photoType },
      evidence: {
        growthStage: vision.growth_stage,
        confidence: vision.confidence,
        farmerConfirmed,
        observedAt,
        weather,
        farmerNote,
      },
    });
  } catch {
    return Response.json(
      { error: "일기 생성 요청을 처리하는 중 서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
