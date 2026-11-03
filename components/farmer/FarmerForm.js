"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import PhotoPlaceholder from "@/components/common/PhotoPlaceholder";
import { preparePhoto } from "./preparePhoto";
import { useObservedWeather } from "./useObservedWeather";
import styles from "./Farmer.module.css";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function ObservedWeather({ result }) {
  if (!result) return <p className={`status-message ${styles.noMargin}`} role="status">날씨를 불러오고 있어요...</p>;
  const observed = result.weather ?? result.partialWeather;
  if (!observed) {
    return (
      <div className={`evidence-grid ${styles.evidence}`} role="status">
        <div className={styles.fullWidth}>
          <span className="evidence-label">날씨</span>
          <span>기상 관측자료 없음</span>
          <span className="caption"> · {result.message}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`evidence-grid ${styles.evidence}`} role="status">
      <div><span className="evidence-label">최고 기온</span><span>{observed.tempMax}°C</span></div>
      <div><span className="evidence-label">최저 기온</span><span>{observed.tempMin}°C</span></div>
      <div className={styles.fullWidth}>
        <span className="evidence-label">강수량</span>
        <span>{observed.rainMm === null ? "기록 없음" : `${observed.rainMm}mm`}</span>
      </div>
      <p className={`caption ${styles.noMargin} ${styles.fullWidth}`}>
        출처: {result.source.provider} {result.source.network} · {result.source.stationName} 관측지점
      </p>
    </div>
  );
}

export default function FarmerForm({ tree }) {
  // 사용자 현지 날짜 사용
  const [week, setWeek] = useState(String(tree.currentWeek));
  const [photoType, setPhotoType] = useState("orchard");
  const [observedAt, setObservedAt] = useState(today);
  const [farmerNote, setFarmerNote] = useState("");
  const [farmerConfirmed, setFarmerConfirmed] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const photoRequest = useRef(0);
  const observedWeather = useObservedWeather(tree.id, observedAt);

  useEffect(() => () => { photoRequest.current += 1; }, []);

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    // 같은 파일도 오류 후 다시 선택할 수 있게 함
    // 취소 시 기존 미리보기 유지
    event.target.value = "";
    if (!file) return;
    const request = ++photoRequest.current;
    setPhoto(null);
    setError("");
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      if (request === photoRequest.current) setPhoto(prepared);
    } catch (cause) {
      if (request === photoRequest.current) {
        setError(cause instanceof Error ? cause.message : "사진을 준비하지 못했어요. 다시 선택해 주세요.");
      }
    } finally {
      if (request === photoRequest.current) setPreparing(false);
    }
  }

  // TODO(2단계): 미반영 편지 조회 연결.
  // TODO(3단계): /api/vision, /api/diary fetch와 대기·오류·재시도 상태 연결.
  // /api/diary의 weather에는 조회가 끝난 observedWeather.weather(객체 또는 null)를 그대로 전달.
  // partialWeather는 화면 표시 전용이므로 전달하지 않음.
  // TODO(3단계): 실제 응답을 DiaryCard로 미리보기. 저장 성공 후에만 편지 반영 표시.
  // TODO(3단계): addGeneratedDiary 저장 실패 시 사진을 제외한 재저장 처리.
  // 현재 단계에서는 날씨 조회 외의 API 호출, 생성 일기 저장, 편지 반영을 수행하지 않음.
  return (
    <>
      <section aria-labelledby="farmer-photo-title">
        <Card className={styles.section}>
          <h2 id="farmer-photo-title" className="title">1. 사진과 기록</h2>
          <div className={styles.field}>
            <label htmlFor="farmer-photo">이번 주 사진</label>
            <input id="farmer-photo" className={`input ${styles.fileInput}`} type="file"
              accept="image/*" onChange={selectPhoto} />
          </div>
          <figure className={styles.noMargin} aria-busy={preparing}>
            {photo ? (
              <Image src={photo.dataUrl} alt="선택한 사진 미리보기" width={photo.width}
                height={photo.height} unoptimized className={styles.photo} />
            ) : <PhotoPlaceholder>{preparing ? "사진을 준비하고 있어요" : "미리보기"}</PhotoPlaceholder>}
            {photo && <figcaption className={`caption ${styles.photoCaption}`}>{photo.name}</figcaption>}
          </figure>
          {preparing && <p className={`status-message ${styles.noMargin}`} role="status">사진을 준비하고 있어요...</p>}
          {error && <p className={`error-message ${styles.noMargin}`} role="alert">{error}</p>}
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor="farmer-week">주차</label>
              <select id="farmer-week" className="input" value={week} onChange={(event) => setWeek(event.target.value)}>
                {Array.from({ length: 53 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value}주차</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="farmer-photo-type">사진 종류</label>
              <select id="farmer-photo-type" className="input" value={photoType}
                onChange={(event) => setPhotoType(event.target.value)}>
                <option value="orchard">과수원 공통</option>
                <option value="tree">내 나무</option>
              </select>
            </div>
          </div>
          <p className={`caption ${styles.noMargin}`}>
            {photoType === "orchard" ? "과수원 전체의 생육 상태를 기록해요." : "선택한 나무의 생육 상태를 기록해요."}
          </p>
          <div className={styles.field}>
            <label htmlFor="farmer-observed-at">관찰 날짜</label>
            <input id="farmer-observed-at" className="input" type="date" value={observedAt}
              onChange={(event) => setObservedAt(event.target.value)} />
          </div>
          <ObservedWeather result={observedWeather} />
          <div className={styles.field}>
            <label htmlFor="farmer-note">농부 메모</label>
            <input id="farmer-note" className="input" type="text" value={farmerNote}
              placeholder="이번 주에 살펴본 내용을 적어 주세요"
              onChange={(event) => setFarmerNote(event.target.value)} />
          </div>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={farmerConfirmed}
              onChange={(event) => setFarmerConfirmed(event.target.checked)} />
            <span>농부가 직접 확인함</span>
          </label>
        </Card>
      </section>
      <section aria-labelledby="farmer-analysis-title">
        <Card className={styles.section}>
          <h2 id="farmer-analysis-title" className="title">2. 사진 분석</h2>
          <Button disabled className="is-locked" aria-describedby="farmer-analysis-help">분석하기</Button>
          <p id="farmer-analysis-help" className={`caption ${styles.noMargin}`}>미구현</p>
          <div className={`evidence-grid ${styles.evidence}`}>
            <div><span className="evidence-label">{photoType === "orchard" ? "생육 단계 (과수원 전체 기준)" : "생육 단계 (내 나무 기준)"}</span><span>분석 전</span></div>
            <div><span className="evidence-label">AI 판단 확신도</span><span>분석 전</span></div>
            <div className={styles.fullWidth}><span className="evidence-label">관찰 내용</span><span>분석 후 표시돼요.</span></div>
            <div className={styles.fullWidth}><span className="evidence-label">불확실한 점</span><span>분석 후 표시돼요.</span></div>
          </div>
        </Card>
      </section>
      <section aria-labelledby="farmer-diary-title">
        <Card className={styles.section}>
          <h2 id="farmer-diary-title" className="title">3. 일기 미리보기</h2>
          <Button disabled className="is-locked" aria-describedby="farmer-diary-help">이번 주 일기 만들기</Button>
          <p id="farmer-diary-help" className={`caption ${styles.noMargin}`}>미구현</p>
          <div className="card-diary">
            <p className="diary-text">아직 만든 일기가 없어요.</p>
            <p className={`caption ${styles.noMargin}`}>사진과 기록으로 만든 일기가 여기에 보여요.</p>
          </div>
        </Card>
      </section>
    </>
  );
}
