/* =========================================================
   내 사과나무 1년 — 아이콘 모음
   ---------------------------------------------------------
   위치: components/common/Icons.js  (공통 디자인 담당만 수정)
   디자인 시안의 아이콘을 그대로 옮겼습니다.

   사용 예
     import { IconHome, IconBack, StageIcon } from "@/components/common/Icons";
     <IconHome />                  // 기본 22px
     <IconLock size={20} />
     <span className="stage-badge" data-stage="개화"><StageIcon stage="개화" /></span>

   규칙
   - 색은 currentColor라서 감싼 요소의 color를 따라갑니다.
     (하단 메뉴에서 현재 메뉴가 빨강으로 바뀌는 것도 이것 덕분)
   - 아이콘은 꾸밈이라 aria-hidden 처리되어 있습니다.
     아이콘만 있는 버튼에는 버튼 쪽에 aria-label을 꼭 넣으세요.
   ========================================================= */

/* 선 아이콘 공통 틀 (24×24 기준) */
function LineIcon({ size = 22, strokeWidth = 1.8, children }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/* ---------- 하단 메뉴 ---------- */

export function IconHome(props) {
  return (
    <LineIcon {...props}>
      <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />
    </LineIcon>
  );
}

export function IconTimeline(props) {
  return (
    <LineIcon {...props}>
      <path d="M12 3v18" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
    </LineIcon>
  );
}

export function IconDiary(props) {
  return (
    <LineIcon {...props}>
      <path d="M6 4h10l3 3v13H6z" />
      <path d="M9 10h7M9 14h7" />
    </LineIcon>
  );
}

export function IconAlbum(props) {
  return (
    <LineIcon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 15l5-4 4 3 3-2 4 3" />
    </LineIcon>
  );
}

/* ---------- 버튼 안 아이콘 ---------- */

export function IconBack(props) {
  return (
    <LineIcon {...props}>
      <path d="M15 5l-7 7 7 7" />
    </LineIcon>
  );
}

export function IconBell({ size = 20, ...props }) {
  return (
    <LineIcon size={size} {...props}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </LineIcon>
  );
}

export function IconSend({ size = 20, ...props }) {
  return (
    <LineIcon size={size} strokeWidth={2} {...props}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </LineIcon>
  );
}

/* 아직 오지 않은 주 */
export function IconLock({ size = 20, ...props }) {
  return (
    <LineIcon size={size} {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </LineIcon>
  );
}

/* 수확 앨범의 QR 안내 */
export function IconQr({ size = 26, ...props }) {
  return (
    <LineIcon size={size} strokeWidth={1.6} {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
    </LineIcon>
  );
}

/* ---------- 생육 단계 아이콘 (28×28 기준) ----------
   stage 값은 Vision 결과의 growth_stage와 같습니다:
   "휴면" | "개화" | "착과" | "비대" | "착색" | "수확기" | "판단 불가"
   - 개화·착과·비대·착색: 시안 그대로
   - 수확기: 착색과 같은 그림
   - 휴면, 판단 불가: 시안에 없어서 새로 그림 (공통 디자인 담당이 바꿔도 됨) */
export function StageIcon({ stage, size = 28 }) {
  const common = {
    "aria-hidden": "true",
    focusable: "false",
    width: size,
    height: size,
    viewBox: "0 0 28 28",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
  };

  switch (stage) {
    case "개화": // 꽃잎 다섯 장 + 가운데 꽃술
      return (
        <svg {...common}>
          <circle cx="14" cy="8" r="4" />
          <circle cx="20" cy="13" r="4" />
          <circle cx="17.5" cy="20" r="4" />
          <circle cx="10.5" cy="20" r="4" />
          <circle cx="8" cy="13" r="4" />
          <circle cx="14" cy="14.5" r="2" fill="currentColor" />
        </svg>
      );

    case "착과": // 작은 열매 + 잎
      return (
        <svg {...common}>
          <path d="M14 9V5" />
          <path d="M14 7C17 4 20 5 21 6C19 8 16 8 14 7" />
          <circle cx="14" cy="16" r="5" />
        </svg>
      );

    case "비대": // 커진 열매 + 잎
      return (
        <svg {...common}>
          <path d="M14 8V4" />
          <path d="M14 6C17 3 20 4 21 5C19 7 16 7 14 6" />
          <circle cx="14" cy="16" r="8" />
        </svg>
      );

    case "착색":
    case "수확기": // 빨갛게 익은 열매 (채움색은 사과 빨강 고정)
      return (
        <svg {...common}>
          <path d="M14 8V4" />
          <circle cx="14" cy="16" r="8" fill="var(--color-apple)" />
        </svg>
      );

    case "휴면": // 잎 없는 가지 (새로 그림)
      return (
        <svg {...common}>
          <path d="M14 24V12" />
          <path d="M14 16L9 11" />
          <path d="M14 13L19 8" />
          <path d="M9 11L7 8M19 8L21 6" />
        </svg>
      );

    default: // "판단 불가" 또는 알 수 없는 값: 물음표 (새로 그림)
      return (
        <svg {...common}>
          <circle cx="14" cy="14" r="9" />
          <path d="M11.5 11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V16" />
          <circle cx="14" cy="19.5" r="0.6" fill="currentColor" />
        </svg>
      );
  }
}
