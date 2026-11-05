- Hono BFF 런타임에서 import하는 패키지는 `dependencies`에 선언한다.
- UI와 Relay 문서는 `apps/app`이 소유하며, 이 package는 인증·GraphQL proxy·Fedify·정적 파일 제공만 담당한다.
- 서버 route 변경은 동작을 소유한 경계에서 검증한다. 앱 조립·라우팅 연결은
  `src/server/app.test.ts`의 통합 테스트 또는 실제 서버 E2E로 확인한다. 요구 동작과 연결을 이미 검증했다면
  파일 위치를 맞추기 위해 같은 검증을 중복 추가하지 않는다.
