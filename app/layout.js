import "../styles/designGuide.css";

export const metadata = {
  title: "내 사과나무 1년",
  description: "나무의 성장 기록과 함께하는 1년",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}