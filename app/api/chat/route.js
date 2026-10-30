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

    const { treeId, question, history, recentDiaries } = body;
    if (
      typeof treeId !== "string" || !treeId.trim() ||
      typeof question !== "string" || !question.trim()
    ) {
      return Response.json(
        { error: "treeId와 question은 비어 있지 않은 문자열이어야 합니다." },
        { status: 400 },
      );
    }
    if (
      (history !== undefined && !Array.isArray(history)) ||
      (recentDiaries !== undefined && !Array.isArray(recentDiaries))
    ) {
      return Response.json(
        { error: "history와 recentDiaries는 전달할 경우 배열이어야 합니다." },
        { status: 400 },
      );
    }

    // Mock 응답: 정확히 일치하는 테스트 질문에만 근거 표시용 응답을 반환합니다.
    if (question === "__MOCK_WITH_SOURCE__") {
      return Response.json({
        answer: "근거 표시 화면을 확인하기 위한 임시 응답입니다.",
        source: "Mock 테스트 기록",
      });
    }

    // 나머지 질문에는 기록에 관계없이 같은 답변을 반환합니다.
    return Response.json({ answer: "그건 아직 모르겠니더.", source: null });
  } catch {
    return Response.json(
      { error: "대화 요청을 처리하는 중 서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
