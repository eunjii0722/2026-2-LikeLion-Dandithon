"use client";

/* =========================================================
   사과 받을 주소 입력 (시연용 가짜 폼)
   ---------------------------------------------------------
   입력한 값은 어디에도 저장하거나 보내지 않음.
   실제 주문으로 오해하지 않게 시연용 안내를 항상 보여줌
   ========================================================= */

import { useState } from "react";
import styles from "./Harvest.module.css";

export default function AddressForm({ treeName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitted(true);
  }

  if (!isOpen) {
    return (
      <div className={styles.addressArea}>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setIsOpen(true)}>
          {treeName}의 사과 받을 주소 입력
        </button>
        <p className="caption" style={{ margin: 0 }}>
          시연용 화면이에요. 실제로 주문되지 않아요.
        </p>
      </div>
    );
  }

  return (
    <form className={`card ${styles.addressArea}`} onSubmit={handleSubmit}>
      <p className="caption" style={{ margin: 0 }}>
        시연용 화면이에요. 실제로 주문되지 않아요.
      </p>

      <label className={styles.field}>
        받는 분
        <input className="input" name="name" autoComplete="name" required />
      </label>
      <label className={styles.field}>
        주소
        <input className="input" name="address" autoComplete="street-address" required />
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitted}>
        입력 완료
      </button>
      <p className="status-message" role="status" style={{ margin: 0 }}>
        {isSubmitted && "시연이라 주소는 저장되지 않았어요. 실제 서비스에서는 가을에 사과가 이 주소로 가요."}
      </p>
    </form>
  );
}
