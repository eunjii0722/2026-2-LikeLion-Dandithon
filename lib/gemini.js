import "server-only";
import { GoogleGenAI } from "@google/genai";
import { VISION_PROMPT, VISION_RESPONSE_SCHEMA } from "./prompts/vision.js";

const VISION_MODEL = "gemini-3.5-flash-lite";
// 개발·시연용 프로세스 단위 제한입니다. 여러 서버 인스턴스 간에는 공유되지 않습니다.
const REQUESTS_PER_MINUTE = 15;
let requestWindow = { startedAt: 0, count: 0 };

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

function validateVisionResult(result) {
  const { properties, required } = VISION_RESPONSE_SCHEMA;
  const isStringArray = (value) => Array.isArray(value)
    && value.every((item) => typeof item === "string" && item.trim().length > 0);
  const isNullableBoolean = (value) => value === null || typeof value === "boolean";

  if (
    !result || typeof result !== "object" || Array.isArray(result) ||
    Object.keys(result).length !== required.length ||
    !required.every((key) => Object.hasOwn(result, key)) ||
    !properties.growth_stage.enum.includes(result.growth_stage) ||
    !isNullableBoolean(result.flowers_visible) ||
    !isNullableBoolean(result.fruit_visible) ||
    !properties.fruit_color.enum.includes(result.fruit_color) ||
    !properties.confidence.enum.includes(result.confidence) ||
    !isStringArray(result.observations) || !isStringArray(result.uncertain_points) ||
    (result.fruit_visible !== true && result.fruit_color !== null) ||
    (result.confidence !== "높음" && result.uncertain_points.length === 0) ||
    (result.confidence === "높음" && result.uncertain_points.length > 0) ||
    (result.growth_stage === "판단 불가" && result.confidence !== "낮음") ||
    (result.growth_stage === "수확기" && result.confidence === "높음")
  ) {
    throw new GeminiError("사진 분석 결과의 형식이나 관찰 근거가 올바르지 않습니다. 다시 시도해 주세요.", 502);
  }
  return result;
}

export async function analyzeTreeImage({ imageBase64, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError("서버에 GEMINI_API_KEY가 설정되지 않았습니다.", 500);
  }

  const now = Date.now();
  if (now - requestWindow.startedAt >= 60_000) {
    requestWindow = { startedAt: now, count: 0 };
  }
  if (requestWindow.count >= REQUESTS_PER_MINUTE) {
    throw new GeminiError("사진 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  requestWindow.count += 1;

  let interaction;
  try {
    // 키는 서버에서만 읽으며 요청·오류 로그에 키나 사진 데이터를 남기지 않습니다.
    const client = new GoogleGenAI({ apiKey });
    interaction = await client.interactions.create({
      model: VISION_MODEL,
      system_instruction: VISION_PROMPT,
      input: [
        { type: "text", text: "첨부한 사과나무 사진의 관찰 결과를 JSON으로 반환하세요." },
        { type: "image", data: imageBase64, mime_type: mimeType },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: VISION_RESPONSE_SCHEMA,
      },
      generation_config: { max_output_tokens: 4096 },
      store: false,
      automatic_continuation: false,
    }, { timeout_ms: 45_000, maxRetries: 0 });
  } catch (error) {
    // SDK의 원본 오류에는 요청 정보가 포함될 수 있어 그대로 반환하지 않습니다.
    if (error.status === 429) {
      throw new GeminiError("Gemini 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
    if (error.status === 401 || error.status === 403) {
      throw new GeminiError("Gemini 인증에 실패했습니다. 서버 API 키와 권한을 확인해 주세요.", 503);
    }
    if (error.status === 400) {
      throw new GeminiError("Gemini가 이미지를 처리할 수 없습니다. 올바른 사진인지 확인해 주세요.", 400);
    }
    if (error.name === "APIConnectionTimeoutError" || error.name === "TimeoutError" || error.status === 504) {
      throw new GeminiError("사진 분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", 504);
    }
    throw new GeminiError("Gemini 사진 분석 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  }

  if (interaction.status !== "completed" || !interaction.output_text?.trim()) {
    throw new GeminiError("Gemini가 사진 분석을 완료하지 못했습니다. 다른 사진으로 다시 시도해 주세요.", 502);
  }

  let result;
  try {
    result = JSON.parse(interaction.output_text);
  } catch {
    throw new GeminiError("Gemini가 올바른 JSON 분석 결과를 반환하지 않았습니다.", 502);
  }
  return validateVisionResult(result);
}
