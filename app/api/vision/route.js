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

    const { imageBase64, mimeType } = body;
    if (
      typeof imageBase64 !== "string" || !imageBase64.trim() ||
      typeof mimeType !== "string" || !mimeType.trim()
    ) {
      return Response.json(
        { error: "imageBase64와 mimeType은 비어 있지 않은 문자열이어야 합니다." },
        { status: 400 },
      );
    }

    // Mock 응답: 실제 이미지 분석 없이 모든 사진에 같은 결과를 반환합니다.
    return Response.json({
      growth_stage: "개화",
      flowers_visible: true,
      fruit_visible: null,
      fruit_color: null,
      observations: ["흰색 꽃이 관찰됩니다."],
      confidence: "높음",
      uncertain_points: [],
    });
  } catch {
    return Response.json(
      { error: "사진 분석 요청을 처리하는 중 서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
