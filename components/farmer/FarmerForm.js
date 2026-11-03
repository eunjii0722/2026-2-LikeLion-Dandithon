"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import PhotoPlaceholder from "@/components/common/PhotoPlaceholder";
import DiaryCard from "@/components/diary/DiaryCard";
import { getSavedWords, subscribeToStorage } from "@/lib/storage";
import { preparePhoto } from "./preparePhoto";
import { useObservedWeather } from "./useObservedWeather";
import { createFarmerWorkflow, INITIAL_WORKFLOW, photoToVisionPayload } from "./farmerWorkflow";
import styles from "./Farmer.module.css";

const subscribeWords = (listener) => subscribeToStorage(listener, ["savedWords"]);
const wordsSnapshot = () => JSON.stringify(getSavedWords());
const serverWordsSnapshot = () => "[]";
const visibleLabel = (value) => value === null ? "판단할 수 없음" : value ? "관찰됨" : "관찰 범위에서 보이지 않음";

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
  const [workflow, setWorkflow] = useState(INITIAL_WORKFLOW);
  const [actions] = useState(() => createFarmerWorkflow({ treeId: tree.id, onChange: setWorkflow }));
  const savedWords = JSON.parse(useSyncExternalStore(subscribeWords, wordsSnapshot, serverWordsSnapshot));
  const { vision, diary, busy, visionError, diaryError, saveResult } = workflow;

  useEffect(() => () => { photoRequest.current += 1; actions.dispose(); }, [actions]);

  function changeInput(setter, value, analysis = false) {
    actions.invalidate(analysis);
    setter(value);
  }

  function generateDiary() {
    actions.generate({ treeId: tree.id, week: Number(week), photoType, farmerNote, farmerConfirmed, observedAt }, observedWeather);
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    // 같은 파일도 오류 후 다시 선택할 수 있게 함
    // 취소 시 기존 미리보기 유지
    event.target.value = "";
    if (!file) return;
    const request = ++photoRequest.current;
    actions.invalidate(true);
    setPhoto(null);
    setError("");
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      photoToVisionPayload(prepared);
      if (request === photoRequest.current) setPhoto(prepared);
    } catch (cause) {
      if (request === photoRequest.current) {
        setError(cause instanceof Error ? cause.message : "사진을 준비하지 못했어요. 다시 선택해 주세요.");
      }
    } finally {
      if (request === photoRequest.current) setPreparing(false);
    }
  }

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
              <select id="farmer-week" className="input" value={week} onChange={(event) => changeInput(setWeek, event.target.value)}>
                {Array.from({ length: 53 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value}주차</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="farmer-photo-type">사진 종류</label>
              <select id="farmer-photo-type" className="input" value={photoType}
                onChange={(event) => changeInput(setPhotoType, event.target.value, true)}>
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
              onChange={(event) => changeInput(setObservedAt, event.target.value)} />
          </div>
          <ObservedWeather result={observedWeather} />
          <div className={styles.field}>
            <label htmlFor="farmer-note">농부 메모</label>
            <input id="farmer-note" className="input" type="text" value={farmerNote}
              placeholder="이번 주에 살펴본 내용을 적어 주세요"
              onChange={(event) => changeInput(setFarmerNote, event.target.value)} />
          </div>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={farmerConfirmed}
              onChange={(event) => changeInput(setFarmerConfirmed, event.target.checked)} />
            <span>농부가 직접 확인함</span>
          </label>
        </Card>
      </section>
      <section aria-labelledby="farmer-analysis-title">
        <Card className={styles.section}>
          <h2 id="farmer-analysis-title" className="title">2. 사진 분석</h2>
          <Button disabled={!photo || preparing || Boolean(busy)} onClick={() => actions.analyze(photo)}
            aria-describedby="farmer-analysis-help">{busy === "vision" ? "분석 중..." : vision ? "다시 분석하기" : "분석하기"}</Button>
          <p id="farmer-analysis-help" className={`caption ${styles.noMargin}`} role="status">
            {busy === "vision" ? "사진을 분석하고 있어요. 잠시 기다려 주세요." : !photo ? "사진을 먼저 선택해 주세요."
              : photoType === "orchard" ? "과수원 전체 사진 기준입니다. 개별 나무의 상태로 단정하지 않아요." : "선택한 나무 사진에서 확인되는 내용을 분석해요."}
          </p>
          {visionError && <p className={`error-message ${styles.noMargin}`} role="alert">{visionError}</p>}
          <div className={`evidence-grid ${styles.evidence}`}>
            <div><span className="evidence-label">{photoType === "orchard" ? "생육 단계 (과수원 전체 기준)" : "생육 단계 (내 나무 기준)"}</span><span>{vision?.growth_stage ?? "분석 전"}</span></div>
            <div><span className="evidence-label">AI 판단 확신도</span><span>{vision?.confidence ?? "분석 전"}</span></div>
            {vision && <>
              <div><span className="evidence-label">꽃 관찰</span><span>{visibleLabel(vision.flowers_visible)}</span></div>
              <div><span className="evidence-label">열매 관찰</span><span>{visibleLabel(vision.fruit_visible)}</span></div>
              <div className={styles.fullWidth}><span className="evidence-label">열매 색상</span><span>{vision.fruit_color ?? "판단할 수 없음"}</span></div>
            </>}
            <div className={styles.fullWidth}><span className="evidence-label">관찰 내용</span>
              {vision ? vision.observations.length ? <ul>{vision.observations.map((text, index) => <li key={index}>{text}</li>)}</ul> : <span>기록된 관찰 내용 없음</span> : <span>분석 후 표시돼요.</span>}
            </div>
            <div className={styles.fullWidth}><span className="evidence-label">불확실한 점</span>
              {vision ? vision.uncertain_points.length ? <ul>{vision.uncertain_points.map((text, index) => <li key={index}>{text}</li>)}</ul> : <span>보고된 불확실한 점 없음</span> : <span>분석 후 표시돼요.</span>}
            </div>
          </div>
        </Card>
      </section>
      <section aria-labelledby="farmer-diary-title">
        <Card className={styles.section}>
          <h2 id="farmer-diary-title" className="title">3. 일기 미리보기</h2>
          <Button disabled={!vision || preparing || Boolean(busy) || !observedWeather || !observedAt}
            onClick={generateDiary} aria-describedby="farmer-diary-help">
            {busy === "diary" ? "일기 만드는 중..." : "이번 주 일기 만들기"}
          </Button>
          <p id="farmer-diary-help" className={`caption ${styles.noMargin}`} role="status">
            {busy === "diary" ? "관찰 기록과 미반영 편지로 일기를 만들고 있어요."
              : !vision ? "사진 분석을 마친 뒤 일기를 만들 수 있어요."
                : !observedWeather ? "선택한 날짜의 날씨 조회를 기다리고 있어요."
                  : observedWeather.weather === null ? "완전한 날씨 자료가 없어 날씨를 모르는 상태로 일기를 만들어요." : "관찰 기록과 날씨, 해당 주차까지의 미반영 편지를 사용해요."}
          </p>
          {diaryError && <p className={`error-message ${styles.noMargin}`} role="alert">{diaryError}</p>}
          {saveResult && <p className={`${saveResult.saved ? "status-message" : "error-message"} ${styles.noMargin}`}
            role={saveResult.saved && !saveResult.unmarked.length ? "status" : "alert"}>
            {!saveResult.saved ? "일기는 생성됐지만 브라우저에 저장하지 못했어요. 저장 공간을 확보한 뒤 다시 저장해 주세요. 편지는 사용 처리하지 않았어요."
              : `${saveResult.withoutPhoto ? "일기는 저장했지만 저장 공간 부족 등으로 사진은 저장하지 못했어요. " : "일기를 저장했어요. "}${saveResult.unmarked.length ? "일부 편지의 반영 표시를 저장하지 못했어요. 다시 시도해 주세요." : ""}`}
          </p>}
          {saveResult && (!saveResult.saved || saveResult.unmarked.length > 0) && <Button variant="secondary"
            disabled={Boolean(busy)} onClick={actions.persist}>{saveResult.saved ? "편지 반영 다시 시도" : "저장 다시 시도"}</Button>}
          {saveResult?.saved && Number(week) > tree.currentWeek && <p className={`caption ${styles.noMargin}`}>
            현재 나무의 {tree.currentWeek}주차보다 이후 기록이므로 홈·타임라인에는 아직 표시되지 않아요.
          </p>}
          {diary ? <DiaryCard key={JSON.stringify([diary.id, diary.text, diary.dialectWords])} diary={diary} savedWords={savedWords} /> : <div className="card-diary">
            <p className="diary-text">아직 만든 일기가 없어요.</p>
            <p className={`caption ${styles.noMargin}`}>사진과 기록으로 만든 일기가 여기에 보여요.</p>
          </div>}
        </Card>
      </section>
    </>
  );
}
