## Context

`apps/app`은 Expo SDK 56의 Continuous Native Generation을 사용하며 Android workflow와 iOS Fastlane lane이 각각 `expo prebuild --clean`으로 일회성 native project를 만든 뒤 production artifact를 빌드한다. Web은 `@sentry/react`를 별도 entry에서 초기화하지만 Native entry는 아직 Expo Router만 시작한다. 공개 DSN과 배포 channel은 공용 설정에 있고 commit release는 배포 build에서만 주입한다.

PROD-483은 Android·iOS의 React 및 native runtime 오류, 개인정보 최소화, source map/debug symbol과 실제 production build 검증을 함께 소유한다. API·Web BFF·Web 관측은 기존 `add-production-sentry-error-collection` change의 책임이며 이번 변경은 그 동작을 바꾸지 않는다.

## Goals / Non-Goals

**Goals:**

- Native SDK를 Expo CNG 경계에서 초기화해 React 및 native runtime 오류를 수집한다.
- 기존 공용 오류 UI와 재시도를 유지하면서 소비된 React 오류도 같은 Native reporter로 전달한다.
- Android·iOS production build에서 commit release와 source map/debug symbol을 Sentry에 연결한다.
- 앱이 사용자·인증 context를 추가하지 않고 local/test 기본 비전송과 업로드 token 비노출을 유지한다.

**Non-Goals:**

- API·Web BFF·Web Sentry 설정 변경
- 사용자 오류 화면 또는 Sentry event ID 표시
- tracing, profiling, replay, 사용자 식별, 전면 로그 수집
- EAS Build/Update 또는 OTA 배포 도입

## Implementation Guidance

### Current Constraints

- `apps/app/index.web.ts`와 `index.ts`가 platform entry를 분리하므로 Native SDK를 공용 Web module에 import하면 Web bundle과 기존 SDK 책임이 섞인다.
- native project는 commit하지 않고 매 build에서 다시 생성하므로 Gradle/Xcode 파일 직접 수정은 다음 prebuild에서 사라진다.
- Android와 iOS build는 EAS가 아니라 저장소 workflow/Fastlane을 사용하므로 업로드 환경 변수는 실제 build process까지 명시적으로 전달돼야 한다.
- 공개 DSN은 앱 설정에 포함될 수 있지만 `SENTRY_AUTH_TOKEN`은 source map/debug symbol 업로드 시점에만 필요한 비밀이다.
- 기존 React 오류 경계는 reporter context가 있을 때 오류를 전달하고 fallback/retry를 소유하므로 별도 오류 화면이나 중첩 React boundary를 추가할 필요가 없다.

### Recommended Approach

- Expo가 권장하는 `@sentry/react-native` config plugin과 Sentry Expo Metro config를 사용한다. CNG prebuild가 Android Gradle 및 iOS Xcode 업로드 hook을 생성하게 하고 generated native project는 수정하지 않는다.
- Native entry에서 router보다 먼저 SDK를 초기화하고 기존 `UnexpectedErrorContext`에 Native reporter를 제공한다. SDK initialization은 공개 DSN, channel과 build-time commit release가 완전한 경우에만 활성화한다.
- `sendDefaultPii: false`, breadcrumb 차단과 tracing/replay 미설정으로 수집 범위를 오류 진단에 한정하며 앱의 account/profile/session 값을 scope에 넣지 않는다.
- Android·iOS production workflow는 `EXPO_PUBLIC_SENTRY_RELEASE=${GITHUB_SHA}`와 GitHub Actions가 prod job에 제공하는 Sentry organization/project/upload token을 실제 build step에 전달한다. token은 환경 변수로만 소비하고 generated project 및 artifact cleanup 경계를 유지한다.
- unit test로 활성화 조건·metadata·privacy 옵션·React capture를 확인하고 Expo config/Metro config 정적 평가 및 clean prebuild로 CNG hook을 검증한다. 실제 symbolication은 배포 artifact에서 별도 release gate로 확인한다.

### Allowed Alternatives

- 동일한 specs와 비밀 경계를 만족한다면 Sentry CLI를 build 후 명시적으로 호출할 수 있다. 다만 Gradle/Xcode plugin이 생성한 bundle·symbol identity를 재구성하는 수동 경로보다 CNG plugin의 기본 upload hook을 우선한다.

### Known Traps

- `SENTRY_AUTH_TOKEN`을 `EXPO_PUBLIC_*`, app config `extra`, Gradle property, Xcode project, repository 파일 또는 배포 artifact에 기록하지 않는다.
- Native SDK를 Web entry에 import하거나 `@sentry/react`를 Native에서 재사용하지 않는다.
- generated `android/`와 `ios/`를 source of truth로 수정하지 않는다.
- React boundary와 SDK root wrapper를 중첩해 같은 처리 오류를 두 번 capture하지 않는다.
- 로컬 prebuild에서 업로드 자격 증명이 없다는 이유로 build를 실패시키거나 외부 업로드를 시도하지 않는다.

## Risks / Trade-offs

- [SDK가 device·OS·stack context를 자동 수집한다] → 기본 PII와 breadcrumb를 끄고 사용자 식별·콘텐츠·인증 값을 앱 scope에 추가하지 않으며 실제 검증 event를 점검한다.
- [업로드 token이나 organization/project 설정이 누락되면 artifact는 빌드돼도 symbolication이 실패할 수 있다] → production workflow 입력을 명시하고 실제 Android·iOS event에서 release와 원본 위치를 완료 gate로 확인한다.
- [Native SDK 추가는 binary runtime을 바꾼다] → 새 Android·iOS production binary로만 배포하며 기존 binary에 OTA로 적용하지 않는다.

## Migration Plan

1. SDK, Expo/Metro 설정, Native entry와 단위 테스트를 추가한다.
2. Android·iOS production workflow에 commit release와 업로드 자격 증명을 전달하고 clean prebuild/build 구성을 검증한다.
3. 새 production binary를 내부 배포한 뒤 플랫폼별 검증 오류에서 release와 원본 JavaScript/native 위치, event 개인정보 범위를 확인한다.
4. 문제가 있으면 Sentry metadata 주입을 제거한 이전 commit으로 binary를 다시 빌드·배포한다. 기존 앱 사용자 데이터 migration은 없다.

## Open Questions

없음. Sentry organization/project/token의 실제 값과 production 검증 실행 시점은 배포 환경 상태이며 코드 계약을 바꾸지 않는다.
