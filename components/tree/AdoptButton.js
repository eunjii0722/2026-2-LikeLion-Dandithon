"use client";

/* 분양 신청 화면의 "결제하고 분양받기": 고른 나무를 저장하고 "분양 완료" 안내 뒤 홈으로 이동.
   결제는 하지 않음 (시연용) */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/common/Button";
import { setSelectedTreeId } from "@/lib/storage";
import { withWa } from "./josa";

const MOVE_DELAY_MS = 1500;

export default function AdoptButton({ treeId, treeName }) {
  const router = useRouter();
  const [status, setStatus] = useState("idle"); // idle | done | failed

  function handleAdopt() {
    if (!setSelectedTreeId(treeId)) {
      setStatus("failed");
      return;
    }
    setStatus("done");
    setTimeout(() => router.push("/"), MOVE_DELAY_MS);
  }

  return (
    <>
      {status === "failed" ? (
        <p className="error-message" role="alert">
          브라우저에 저장하지 못했어요. 사생활 보호 모드라면 끄고 다시 시도해 주세요.
        </p>
      ) : (
        <p className="status-message" role="status">
          {status === "done" &&
            `분양 완료! (시연이라 결제는 되지 않았어요) 이제 ${withWa(treeName)} 1년을 함께해요. 홈으로 이동할게요.`}
        </p>
      )}
      <Button block onClick={handleAdopt} disabled={status === "done"}>
        결제하고 분양받기 (시연)
      </Button>
    </>
  );
}
