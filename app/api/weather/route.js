import { getTree } from "@/lib/data";
import { fetchDailyWeather } from "@/lib/weather";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const treeId = searchParams.get("treeId");

  if (
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) {
    return Response.json(
      { error: "date는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다." },
      { status: 400 },
    );
  }
  if (!treeId || !treeId.trim()) {
    return Response.json(
      { error: "treeId는 비어 있지 않은 문자열이어야 합니다." },
      { status: 400 },
    );
  }
  const tree = getTree(treeId);
  if (!tree) {
    return Response.json(
      { error: "존재하지 않는 treeId입니다." },
      { status: 404 },
    );
  }

  const { status, ...result } = await fetchDailyWeather(date, tree.farm.region);
  return Response.json(result, { status });
}
