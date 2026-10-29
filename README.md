# 2026-2-LikeLion-Dandithon

## 개발 환경 설정 및 실행 방법

### 1. 사전 준비

다음 프로그램을 설치해야 합니다.

- Git
- Node.js (20.9 이상, LTS 버전 권장)
- Visual Studio Code

### 2. 프로젝트 다운로드

터미널(PowerShell)을 열고 프로젝트를 저장할 폴더로 이동한 후 다음 명령어를 실행합니다.

```powershell
git clone https://github.com/eunjii0722/2026-2-LikeLion-Dandithon.git
cd 2026-2-LikeLion-Dandithon
```

**이미 저장소를 다운로드한 경우 다시 clone할 필요는 없습니다.**

### 3. 패키지 설치 및 실행

```powershell
npm ci
npm run dev
```

실행 후 브라우저에서 아래 주소로 접속합니다.

http://localhost:3000

개발 서버를 종료하려면 터미널에서 `Ctrl + C`를 누릅니다.

> Next.js 프로젝트 초기 설정은 완료되어 있으므로 `create-next-app`을 다시 실행할 필요가 없습니다.

### 4. Gemini API 환경변수 설정

Gemini AI 기능을 사용하려면 개인 개발 환경에 API 키를 설정해야 합니다.

**① `.env.local` 파일 생성**

프로젝트 루트에서 PowerShell을 실행합니다.

```powershell
Copy-Item .env.example .env.local
```

**② Gemini API 키 입력**

생성된 `.env.local` 파일을 열고 발급받은 API 키를 입력합니다.

```dotenv
GEMINI_API_KEY=발급받은_API_키
```

API 키는 서버에서 `process.env.GEMINI_API_KEY`로 불러옵니다.

**③ 개발 서버 실행**

```powershell
npm run dev
```

이미 실행 중이라면 서버를 종료한 후 다시 실행해야 변경된 환경변수가 반영됩니다.

**주의사항**

- `.env.example`: 환경변수 이름을 공유하는 예시 파일로, GitHub에 업로드합니다.
- `.env.local`: 실제 API 키를 저장하는 개인 설정 파일로, GitHub에 업로드하지 않습니다.
- `.env.local`은 `.gitignore`에 의해 Git 추적 대상에서 제외됩니다.
- API 키를 소스 코드에 직접 작성하거나 `NEXT_PUBLIC_` 접두사가 붙은 변수에 저장하지 않습니다.
- API 키는 서버 측 API Route에서만 사용합니다.
- AI 기능을 사용하지 않는 일반 프론트엔드 개발자는 초기 화면 개발 단계에서 API 키 없이 작업할 수 있습니다.

### 5. 작업 브랜치 생성

작업을 시작하기 전에 최신 `main` 브랜치를 받아옵니다.

```powershell
git switch main
git pull origin main
```

이후 본인의 작업에 맞는 브랜치를 생성합니다.

```powershell
git switch -c FE/feature/home
```

브랜치 이름은 담당 기능에 따라 변경합니다.

- 프론트엔드: `FE/feature/기능명`
- 백엔드 및 AI API: `BE/feature/기능명`

### 6. 작업 완료 후 GitHub에 업로드

```powershell
git status
git add .
git commit -m "홈 화면 UI 구현"
git push -u origin FE/feature/home
```

커밋 메시지와 브랜치 이름은 실제 작업에 맞게 수정합니다.

GitHub에서 해당 브랜치의 Pull Request를 생성하고, 변경사항 확인 후 `main`에 병합합니다.

### 7. 협업 시 주의사항

- `main` 브랜치에서 직접 개발하지 않고 기능별 브랜치를 생성합니다.
- 다른 팀원의 작업을 덮어쓰지 않도록 수정 범위를 확인합니다.
- 작업 내용을 작은 단위로 나누어 커밋합니다.
- 기능 완료 후 PR을 생성하여 `main`에 병합합니다.
- `node_modules/`, `.next/`, `.env.local`은 GitHub에 업로드하지 않습니다.
- Gemini API 키 등 비밀정보는 코드에 직접 작성하거나 GitHub에 올리지 않습니다.
