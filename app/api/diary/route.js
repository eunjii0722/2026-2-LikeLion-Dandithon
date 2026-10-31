import { generateTreeDiary, GeminiError } from "@/lib/gemini";

export async function POST(request) {
  try {
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

    // 기존 Mock의 최소 Vision 입력은 유지하며, 추가 관찰 정보는 전달됐을 때 검증합니다.
    const isNullableBoolean = (value) => value === null || typeof value === "boolean";
    const isStringArray = (value) => Array.isArray(value)
      && value.every((item) => typeof item === "string");
    if (
      (vision.flowers_visible !== undefined && !isNullableBoolean(vision.flowers_visible)) ||
      (vision.fruit_visible !== undefined && !isNullableBoolean(vision.fruit_visible)) ||
      (vision.fruit_color !== undefined && !["초록", "일부 붉음", "대부분 붉음", null].includes(vision.fruit_color)) ||
      (vision.observations !== undefined && !isStringArray(vision.observations)) ||
      (vision.uncertain_points !== undefined && !isStringArray(vision.uncertain_points))
    ) {
      return Response.json(
        { error: "vision의 꽃·열매 여부, 색상, 관찰 내용 또는 불확실한 점의 형식이 올바르지 않습니다." },
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

    // 검증한 계약 필드만 전달합니다. 데이터 파일·브라우저 저장소는 조회하지 않습니다.
    const generated = await generateTreeDiary({
      treeId, week, photoType,
      vision: {
        growth_stage: vision.growth_stage,
        confidence: vision.confidence,
        flowers_visible: vision.flowers_visible,
        fruit_visible: vision.fruit_visible,
        fruit_color: vision.fruit_color,
        observations: vision.observations,
        uncertain_points: vision.uncertain_points,
      },
      weather: { tempMax: weather.tempMax, tempMin: weather.tempMin, rainMm: weather.rainMm },
      farmerNote, farmerConfirmed, observedAt, letters,
    });

    // 식별자, 계절, 사진, 근거는 Gemini 결과와 분리하여 서버에서 구성합니다.
    return Response.json({
      id: `${treeId}-w${week}`,
      treeId,
      week,
      season,
      title: generated.title,
      text: generated.text,
      // 별도 특보 입력 계약이 준비되면 연결합니다.
      isSpecial: false,
      dialectWords: generated.dialectWords,
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
  } catch (error) {
    if (error instanceof GeminiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "일기 생성 요청을 처리하는 중 서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
