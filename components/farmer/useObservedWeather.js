"use client";

import { useEffect, useState } from "react";

const DEBOUNCE_MS = 300;
const REQUEST_TIMEOUT_MS = 12_000;
const FAILED = { weather: null, reason: "request_failed", message: "지금은 자료를 불러오지 못했어요." };

// 같은 날짜의 진행 중인 요청과 확정된 결과를 재사용합니다.
const requests = new Map();

const isWeather = (value) => value !== null && typeof value === "object"
  && ["tempMax", "tempMin", "rainMm"].every((key) => Number.isFinite(value[key]));
const isPartialWeather = (value) => value !== null && typeof value === "object"
  && Number.isFinite(value.tempMax) && Number.isFinite(value.tempMin) && value.rainMm === null;

async function requestWeather(treeId, date) {
  const query = new URLSearchParams({ date, treeId });
  const response = await fetch(`/api/weather?${query}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const data = await response.json();
  if (isWeather(data?.weather)) return { result: data, final: true };
  if (data?.weather !== null) return { result: FAILED, final: false };
  if (data.partialWeather !== undefined && !isPartialWeather(data.partialWeather)) return { result: FAILED, final: false };
  // 일시적 실패와 아직 제공 전인 날짜는 다음 조회 때 다시 확인합니다.
  return { result: data, final: response.ok && data.reason !== "not_yet_available" };
}

function loadWeather(treeId, date) {
  const key = `${treeId}:${date}`;
  if (requests.has(key)) return requests.get(key);
  const request = requestWeather(treeId, date)
    .catch(() => ({ result: FAILED, final: false }))
    .then(({ result, final }) => {
      if (!final) requests.delete(key);
      return result;
    });
  requests.set(key, request);
  return request;
}

// 관찰 날짜의 날씨 조회 결과입니다. 조회 중에는 null이며, 값이 없으면 result.weather가 null입니다.
// result.partialWeather는 강수량이 비어 있는 날의 화면 표시 전용입니다.
export function useObservedWeather(treeId, date) {
  const key = `${treeId}:${date}`;
  const [settled, setSettled] = useState(null);

  useEffect(() => {
    if (!date) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      loadWeather(treeId, date).then((result) => {
        // 그사이 날짜가 바뀌었다면 오래된 응답을 버립니다.
        if (current) setSettled({ key, result });
      });
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, treeId, date]);

  if (!date) return { weather: null, reason: "no_date", message: "관찰 날짜를 선택해 주세요." };
  return settled?.key === key ? settled.result : null;
}
