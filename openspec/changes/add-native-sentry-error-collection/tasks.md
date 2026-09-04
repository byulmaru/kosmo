## 1. PROD-483 Android·iOS 오류 수집과 symbolication

**Authority / Provenance**

- PROD-477
- PROD-483

**Deliverable**

Android·iOS production 앱의 처리되지 않은 React·native runtime 오류가 사용자·민감 context 없이 환경·commit release와 함께 수집되고, 업로드한 source map/debug symbol로 원본 위치를 확인할 수 있다.

**Guardrails**

- 앱은 사용자 식별자·사용자 콘텐츠·인증 정보를 Sentry context에 추가하지 않고 기본 PII·자동 breadcrumb·session tracking을 비활성화한다.
- 배포 DSN·환경·release가 완전하지 않은 local/test 실행은 외부 event를 전송하지 않는다.
- source map/debug symbol upload token은 앱 bundle, repository, generated native project와 배포 artifact에 남기지 않는다.
- API·Web BFF·Web 수집과 기존 React 오류 UI·재시도 동작을 변경하지 않는다.

**Verification**

- Native 초기화 조건, metadata·privacy 옵션과 기존 React boundary capture를 단위 테스트로 검증한다.
- Expo config, Metro config, TypeScript와 clean Android/iOS prebuild에서 native SDK 및 upload hook 구성을 검증한다.
- Android·iOS production workflow가 full commit SHA와 보호된 Sentry upload 설정을 실제 build에 전달하는지 정적 검사한다.
- 내부 배포한 Android·iOS production build의 검증 event에서 release, 원본 JavaScript/native 위치와 사용자·민감 context 부재를 확인한다.

- [x] 1.1 Native SDK 초기화와 기존 공용 React 오류 reporter 연결을 구현하고 설정·capture 단위 테스트를 추가한다.
- [x] 1.2 Expo CNG/Metro 설정과 Android·iOS production build의 release·source map·debug symbol upload 경계를 구현한다.
- [x] 1.3 Native 오류 수집·자격 증명·배포 검증 절차를 문서화하고 관련 package check/test, OpenSpec strict validation 및 clean prebuild 검증을 통과시킨다.
- [ ] 1.4 내부 배포한 Android·iOS production build에서 검증 event의 full SHA release, 원본 위치와 사용자·민감 context 부재를 확인한다.

  1.1-1.3 verification evidence (2026-09-05): Native focused test와 앱 unit test 383개, Relay/TypeScript check, Storybook static build, Android·iOS clean Expo prebuild, Expo/Metro config load, actionlint, Ruby syntax, Prettier, strict OpenSpec과 diff check를 통과했다. Sentry properties에는 organization/project와 token 환경 변수 안내만 생성되고 token 값은 기록되지 않았다. Storybook browser test는 샌드박스 listen 제한을 벗어난 재실행에서 Playwright Chromium 미설치로 시작하지 못했으며 이 변경과 관련된 test failure는 관찰되지 않았다. 실제 production signing/build와 Sentry event·symbolication은 1.4 release gate에 남긴다.
