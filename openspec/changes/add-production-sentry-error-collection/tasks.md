## 1. PROD-484 API·Web BFF 오류 수집

**Authority / Provenance**

- PROD-477
- PROD-484

**Deliverable**

프로덕션 API와 Web BFF의 처리되지 않은 오류가 기존 응답을 유지하며 runtime·환경·커밋 release와 SDK가 만든 exception 전체를 포함해 한 번 수집된다.

**Guardrails**

- 예상 Kosmo 도메인 오류와 OIDC 인증 오류는 수집하지 않는다.
- Sentry SDK event는 `beforeSend` 정제 없이 그대로 전달하고 자동 breadcrumb만 제거한다.
- 명시적 배포 enable, DSN, environment와 release가 모두 없으면 외부 전송하지 않는다.
- API GraphQL 변환과 HTTP 전역 경계가 같은 오류를 중복 수집하지 않는다.

**Verification**

- server event 전달 설정과 활성화 조건, API unexpected/expected GraphQL 오류, API HTTP 경계와 BFF expected/unexpected 오류를 단위·통합 테스트로 검증한다.
- API와 Web package check/test, production server artifact 실행 smoke를 통과시킨다.

- [x] 1.1 Server Sentry SDK의 event 전달·runtime metadata 정책을 구현하고 설정 조합별 테스트를 추가한다.
- [x] 1.2 API GraphQL unexpected 오류와 GraphQL 밖 HTTP unexpected 오류를 한 번 수집하도록 연결하고 예상 오류·응답 회귀를 검증한다.
- [x] 1.3 Web BFF 전역 경계에서 unexpected 오류만 수집하고 OIDC 예상 오류·500 응답 회귀를 검증한다.
- [x] 1.4 API·Web BFF production JavaScript/source map artifact를 생성하고 실행 entrypoint와 smoke 검증을 정렬한다.

## 2. PROD-493 Web 앱 오류 수집

**Authority / Provenance**

- PROD-477
- PROD-493

**Deliverable**

배포된 Web 앱의 처리되지 않은 browser·React 오류가 기존 오류 UI와 재시도를 유지하며 runtime·환경·커밋 release와 원본 위치를 가진 event로 한 번 수집된다.

**Guardrails**

- Android·iOS platform에서는 Sentry SDK를 초기화하거나 native 범위를 선행하지 않는다.
- Sentry SDK event는 `beforeSend` 정제 없이 그대로 전달하고 console·UI·network breadcrumb만 제거한다.
- 업로드 token은 client bundle에 포함하지 않고 local/test는 기본 비전송한다.
- 기존 `GraphQLErrorBoundary`의 오류 화면·문구·재시도 행동을 변경하지 않는다.

**Verification**

- Web 전용 초기화와 native 관측 제외, event 전달 설정, React boundary capture와 기존 fallback/retry를 단위·Storybook 또는 관련 UI test로 검증한다.
- Relay, TypeScript, Expo Web export와 Web source map 정적 검증을 통과시킨다.

- [x] 2.1 Web-only Sentry 초기화·event 전달과 native 관측 제외 경계를 구현하고 활성화 설정 테스트를 추가한다.
- [x] 2.2 공용 React 오류 경계의 Web capture를 기존 fallback·retry 동작에 연결하고 중복 없는 capture를 검증한다.
- [x] 2.3 Expo Web build가 외부 source map을 생성하고 업로드 뒤 제공 asset에서 map과 참조를 제거하도록 정렬한다.

## 3. PROD-477 배포·통합 운영 검증

**Authority / Provenance**

- PROD-477
- PROD-484
- PROD-493

**Deliverable**

API, Web BFF와 Web browser가 동일 커밋 release와 일관된 환경/runtime 식별자를 사용하고, 자격 증명·source map 보안 경계와 배포 후 검증·triage 절차가 재현 가능하게 운영된다.

**Guardrails**

- source map 업로드 token은 BuildKit secret으로만 소비하고 저장소·로그·image·Web asset에 남기지 않는다.
- 환경에 독립적인 공용 DSN, project slug와 build token은 Vault shared secret에서 관리한다. Build에는 env BuildKit secret 하나를 전달해 DSN을 Web의 `EXPO_PUBLIC_` 변수로만 남기고 upload 설정은 build에서만 소비한다. API와 Web BFF에는 shared의 DSN만 runtime Secret으로 주입한다.
- Android·iOS PROD-483 범위는 통합 완료 조건에 포함하지 않는다.
- 실제 event, release, symbolication, event 전달 결과와 알림 전달을 확인하기 전에는 부모 통합 검증과 OpenSpec archive를 완료하지 않는다.

**Verification**

- strict OpenSpec, lint, format, package test/build, Docker source map 정적 검사와 secret 없는 build 경로를 통과시킨다.
- 배포 후 API·Web BFF·Web 검증 event에서 동일 release, runtime/environment, 원본 위치, event 전달 결과와 알림 전달을 체크리스트로 확인한다.

- [x] 3.1 GitHub Actions·Docker·Helm/Vault에 release, environment/runtime, 공개/비공개 DSN과 BuildKit 업로드 secret 경계를 연결한다.
- [x] 3.2 설정, event 전달 정책, build·배포 검증과 Sentry 새 오류를 Linear 담당 작업으로 넘기는 triage 문서를 작성한다.
- [x] 3.3 관련 package와 production artifact 검증, lint/format, strict OpenSpec과 secret·source map 정적 검사를 통과시킨다.
- [ ] 3.4 배포 후 세 runtime의 실제 event, release·source map, event 전달 결과와 알림 전달을 확인한다.
