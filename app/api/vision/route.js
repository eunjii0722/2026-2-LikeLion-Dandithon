import { analyzeTreeImage, GeminiError } from "@/lib/gemini";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
// Base64 확장분과 JSON 필드를 포함합니다. Content-Length가 없는 요청에도 적용합니다.
const MAX_BODY_BYTES = MAX_BASE64_LENGTH + 16 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function readJsonBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new GeminiError("요청이 너무 큽니다. 사진은 4MB 이하여야 합니다.", 413);
  }
  if (!request.body) {
    throw new SyntaxError("Empty body");
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new GeminiError("요청이 너무 큽니다. 사진은 4MB 이하여야 합니다.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// 파일 헤더와 선언한 MIME이 일치하는지 확인합니다. 전체 디코딩은 Gemini에서 수행합니다.
function matchesImageType(bytes, mimeType) {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const boxSize = bytes.readUInt32BE(0);
  if (boxSize < 16 || boxSize > bytes.length || boxSize % 4 !== 0) return false;
  const brands = [bytes.toString("ascii", 8, 12)];
  for (let offset = 16; offset < boxSize; offset += 4) {
    brands.push(bytes.toString("ascii", offset, offset + 4));
  }
  const allowedBrands = mimeType === "image/heic"
    ? ["heic", "heix", "hevc", "hevx"]
    : ["mif1", "msf1", "heic", "heix", "hevc", "hevx"];
  return brands.some((brand) => allowedBrands.includes(brand));
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await readJsonBody(request);
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

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return Response.json(
        { error: "지원하지 않는 MIME 형식입니다. JPEG, PNG, WEBP, HEIC, HEIF 사진을 사용해 주세요." },
        { status: 400 },
      );
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return Response.json({ error: "사진은 4MB 이하여야 합니다." }, { status: 413 });
    }
    // data URL이 아닌 순수 Base64를 받습니다. 잘못된 문자와 패딩을 묵인하지 않습니다.
    if (imageBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
      return Response.json({ error: "imageBase64는 올바른 Base64 문자열이어야 합니다." }, { status: 400 });
    }
    const imageBytes = Buffer.from(imageBase64, "base64");
    if (imageBytes.length > MAX_IMAGE_BYTES) {
      return Response.json({ error: "사진은 4MB 이하여야 합니다." }, { status: 413 });
    }
    if (imageBytes.toString("base64") !== imageBase64 || !matchesImageType(imageBytes, mimeType)) {
      return Response.json(
        { error: "사진 데이터가 올바르지 않거나 mimeType과 일치하지 않습니다." },
        { status: 400 },
      );
    }

    const result = await analyzeTreeImage({ imageBase64, mimeType });
    return Response.json(result);
  } catch (error) {
    if (error instanceof GeminiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "사진 분석 요청을 처리하는 중 서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
