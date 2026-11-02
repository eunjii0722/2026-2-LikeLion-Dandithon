// 사진은 브라우저 안에서만 처리하며 실제 전송은 API 연결 단계에서 추가 예정
export async function preparePhoto(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("사진 파일을 선택해 주세요.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("사진을 열 수 없어요. JPG나 PNG 사진으로 다시 선택해 주세요."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("사진 크기를 확인할 수 없어요. 다른 사진을 선택해 주세요.");
    }
    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서 사진을 준비할 수 없어요.");
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
      throw new Error("사진 변환에 실패했어요. 다른 사진을 선택해 주세요.");
    }
    return { name: file.name, dataUrl, width, height, mimeType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
