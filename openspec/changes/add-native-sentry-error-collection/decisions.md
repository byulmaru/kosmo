## Context

이 기록은 PROD-477의 공통 production 오류 관측 목표와 PROD-483의 Android·iOS 오류 수집, 개인정보 최소화, release·source map·debug symbol 및 실제 앱 검증 범위를 Expo CNG와 현재 배포 workflow에 적용한 선택을 정리한다.

## Decision Records

### Native event에는 사용자 context를 추가하지 않는다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: PROD-483
- Status: Active
- Context / Problem: 오류 원인 조사에는 stack과 device/runtime 정보가 필요하지만 PROD-483은 민감정보와 사용자 콘텐츠가 event에 포함되지 않을 것을 요구한다.
- Decision Outcome: 앱은 account/profile/session 식별자, 사용자 콘텐츠와 인증 정보를 Sentry scope·tag·extra·breadcrumb에 추가하지 않는다. SDK의 기본 PII, 자동 breadcrumb와 session tracking을 비활성화한다.
- Alternatives Considered: 사용자 ID 또는 화면 행동 breadcrumb를 추가하면 조사 단서가 늘 수 있지만 현재 개인정보 최소화 계약을 충족하지 못하므로 선택하지 않는다.
- Consequences: 오류 event는 stack, release, environment, platform과 SDK 기본 비사용자 진단 context에 한정되며 사용자별 상관 분석은 제공하지 않는다.
- Confirmation / Follow-up: 설정 단위 테스트와 실제 Android·iOS 검증 event에서 사용자·인증·콘텐츠 context 부재를 확인한다.

### Expo CNG plugin이 Native upload hook을 생성한다

- Decision Date: 2026-09-04
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-483
- Status: Active
- Context / Problem: 저장소는 Android/iOS project를 보관하지 않고 production build마다 `expo prebuild --clean`으로 생성하므로 generated Gradle/Xcode 파일을 직접 고치면 변경이 유지되지 않는다.
- Decision Outcome: Expo가 지원하는 `@sentry/react-native` config plugin과 Sentry Expo Metro config로 native crash 수집 및 JavaScript source map/native debug symbol upload hook을 생성한다.
- Alternatives Considered: generated project 직접 수정은 CNG에서 사라진다. build 후 Sentry CLI를 수동 호출하는 방식은 platform별 artifact identity와 hook을 중복 구성해야 하므로 기본 경로로 선택하지 않는다.
- Consequences: Sentry SDK/plugin version은 앱의 native dependency가 되고 새 binary가 필요하다. 업로드 동작은 prebuild가 만든 Android/iOS build hook과 실제 production build 환경 변수에 의존한다.
- Confirmation / Follow-up: clean Android/iOS prebuild 결과와 production build log, Sentry release artifact 및 원본 위치를 플랫폼별로 확인한다.

### Commit SHA를 Native release identity로 사용한다

- Decision Date: 2026-09-04
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-477, PROD-483
- Status: Active
- Context / Problem: 앱 package version과 build number만으로는 같은 source의 배포 회귀를 repository commit 및 기존 Web/server release와 일관되게 추적하기 어렵다.
- Decision Outcome: Android·iOS production workflow가 immutable `GITHUB_SHA`를 Native runtime과 Sentry upload의 release identity로 전달한다. DSN은 공개 앱 설정을 사용하고 organization/project는 GitHub Actions variable, upload token은 prod job에 제공되는 GitHub Actions secret으로 build process에만 전달한다.
- Alternatives Considered: 앱 version/build number만 사용하면 source commit과 기존 runtime release를 직접 연결하지 못한다. token을 app config나 repository 파일에 넣는 방식은 배포 artifact에 비밀을 노출할 수 있어 선택하지 않는다.
- Consequences: 같은 commit의 Web/server/Native 오류를 같은 release 기준으로 탐색할 수 있지만 Android·iOS build number는 별도 store artifact identity로 계속 유지된다.
- Confirmation / Follow-up: workflow 정적 검증과 실제 Sentry event/artifact에서 release가 build의 full SHA와 일치하고 token이 repository·generated project·artifact에 남지 않는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
