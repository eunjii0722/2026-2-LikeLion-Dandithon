"use client";

/* "이 나무 분양받기": 고른 나무를 저장하고 "분양 완료" 안내 뒤 홈으로 이동.
   결제는 하지 않음 (시연용) */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSelectedTreeId } from "./tempStorage";

const MOVE_DELAY_MS = 1500;

export default function AdoptButton({ treeId, treeName }) {
  const router = useRouter();
  const [isDone, setIsDone] = useState(false);

  function handleAdopt() {
    setSelectedTreeId(treeId);
    setIsDone(true);
    setTimeout(() => router.push("/"), MOVE_DELAY_MS);
  }

  return (
    <>
      <p className="status-message" role="status">
        {isDone && `분양 완료! 이제 ${treeName}와 1년을 함께해요. 홈으로 이동할게요.`}
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={handleAdopt} disabled={isDone}>
        이 나무 분양받기
      </button>
    </>
  );
}
