/* 이름 뒤 조사 "와/과": 받침이 있으면 "과" (예: 홍이와, 보람과) */

export function withWa(name) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${name}${hasFinal ? "과" : "와"}`;
}
