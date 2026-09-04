## Why

현재 Android·iOS 앱은 처리되지 않은 React 및 native runtime 오류를 중앙에서 확인할 수 없어, 배포 회귀를 release와 원본 위치 기준으로 조사할 수 없다. PROD-483이 소유한 후속 범위로 Native 오류 수집과 symbolication 배포 경계를 연결한다.

## What Changes

- Expo Native 진입점에서 Android·iOS의 처리되지 않은 React 및 native runtime 오류를 Sentry에 수집한다.
- production build의 environment와 commit release를 event에 연결하고 JavaScript source map 및 native debug symbol을 업로드한다.
- 사용자 식별·사용자 콘텐츠·민감정보를 애플리케이션 context로 추가하지 않고, SDK의 기본 PII·breadcrumb·세션 추적을 비활성화한다.
- DSN과 업로드 token의 노출 경계를 분리하고 local/test에서는 배포 metadata가 없으면 외부 전송하지 않는다.
- 실제 Android·iOS production build에서 검증 event의 release와 원본 위치를 확인하는 운영 절차를 추가한다.
- API·Web BFF·Web 오류 수집과 사용자 오류 화면은 변경하지 않는다.

## Authority / Provenance

- Canonical: 없음. 이 변경의 제품·보안 계약은 Linear 이슈가 소유한다.
- Linear Contract: PROD-477
- Linear Implementations: PROD-483

## Capabilities

### New Capabilities

- `native-error-observability`: Android·iOS 처리되지 않은 오류 수집, 개인정보 최소화, release·source map·debug symbol 연결과 배포 검증 계약

### Modified Capabilities

없음.

## Impact

- `apps/app`의 Native 진입점, 공용 React 오류 경계, Expo/Metro 설정과 앱 의존성
- Android·iOS production build workflow와 Sentry 업로드 자격 증명
- Native 오류 수집·symbolication 운영 문서
