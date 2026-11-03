/* 이름 뒤 조사: 받침이 있으면 "과"·"이", 없으면 "와"·"가" (예: 홍이와·홍이가, 보람과·보람이) */

function hasFinalConsonant(name) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

export function withWa(name) {
  return `${name}${hasFinalConsonant(name) ? "과" : "와"}`;
}

export function withGa(name) {
  return `${name}${hasFinalConsonant(name) ? "이" : "가"}`;
}
