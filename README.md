# 빚오프 직원·변호사 업무공간

독립 React 빌드와 정적 화면입니다. API·인증·DB는 별도 backend 저장소에서 제공합니다. 상대 역할의 화면 소스와 backend 코드는 포함하지 않습니다.

## 실행

Node.js 22 이상에서 `npm ci`, `npm run build`, `npm start`를 순서대로 실행합니다. 접속 주소는 http://localhost:5174 입니다. 개발 시 `npm run dev`로 빌드와 서버를 함께 시작할 수 있습니다.

`DEBTOFF_API_ORIGIN=http://localhost:8000`, `PORT=5174`, `HOST=127.0.0.1`을 실행 환경변수로 설정할 수 있습니다. `.env` 파일은 자동으로 로드되지 않습니다. `/config.js`가 서버 시작 환경의 API 주소를 브라우저에 전달하므로 배포 후에도 프론트 재빌드 없이 API 주소를 바꿀 수 있습니다. backend의 `DEBTOFF_CORS_ORIGINS`에는 이 프론트 주소를 등록해야 합니다.

프론트에는 API 키를 넣지 않습니다. `.env.example`에는 공개 가능한 API 주소만 있습니다. 로그인은 backend의 계정을 사용합니다.

## 배포와 구조

`docker build -t debtoff-office .` 후 `docker run --rm -p 5174:5174 -e DEBTOFF_API_ORIGIN=https://your-api.example debtoff-office`로 실행합니다. Docker는 React를 빌드한 후 정적 파일과 작은 HTTP 서버만 포함합니다. `dist/`는 빌드 결과이며 Git에 저장하지 않습니다.

- `apps/office`: 화면 동작과 스타일
- `apps/frontend/src`: 이 역할의 React 컴포넌트와 진입점
- `apps/shared`: 공통 표시·API 클라이언트·스타일·이미지
- `build.mjs`: 독립 esbuild 빌드
- `scripts/serve.mjs`: 정적 파일 및 런타임 공개 설정 제공

이미지 원출처는 `apps/shared/images/credits.json`에 있습니다. UI 이력 확인·오류 보완 동작은 기존 화면과 동일한 API 계약을 사용합니다.
