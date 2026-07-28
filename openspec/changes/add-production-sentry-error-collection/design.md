## Context

API와 Web BFF는 Hono/Node ESM 애플리케이션이며 TypeScript source를 `tsx`로 직접 실행한다. API GraphQL은 Yoga plugin에서 예상 도메인 오류와 unexpected 오류를 이미 구분하고, Web BFF는 Hono `onError`에서 OIDC 예상 오류를 분리한다. Web UI는 Expo Router의 동일 source를 Web·Android·iOS가 공유하고, 현재 공용 `GraphQLErrorBoundary`가 render 오류를 console에만 기록한다.

배포 image는 Docker 안에서 Expo Web export와 server runtime source를 함께 만들며, GitHub Actions가 image를 push하고 Helm/Vault가 API·Web pod 환경을 주입한다. 따라서 runtime DSN, 공개 Web DSN, source map 업로드 token은 서로 다른 수명과 노출 경계를 가져야 한다.

## Goals / Non-Goals

**Goals:**

- API, Web BFF와 Web browser의 unexpected 오류를 기존 응답·UI를 유지하며 한 번씩 수집한다.
- 세 runtime에 같은 커밋 release와 일관된 environment/runtime metadata를 붙인다.
- Sentry SDK가 만든 event와 exception은 `beforeSend`로 정제하지 않고 그대로 전달하며 자동 breadcrumb만 제거한다.
- build에서 server/Web source map을 생성·검증·업로드하고 제공 artifact에서는 제거한다.
- 자격 증명 주입, 배포 검증과 triage 경로를 저장소 문서로 재현 가능하게 만든다.

**Non-Goals:**

- Android·iOS SDK, native crash 수집과 debug symbol
- tracing, Session Replay, 전면 로그 수집, 사용자 식별
- 예상 도메인 오류 전송과 사용자 오류 UI·event ID 변경
- Sentry 조직·프로젝트·알림 rule 자체를 저장소에서 자동 생성하는 provisioning

## Implementation Guidance

### Current Constraints

- API GraphQL 오류는 Yoga가 응답으로 소비하므로 Hono `onError`만 연결하면 resolver unexpected 오류가 누락된다. 반대로 두 경계에서 무조건 capture하면 같은 오류가 중복될 수 있다.
- `NODE_ENV=production`은 API unit test에서도 사용하므로 활성화 조건으로 사용할 수 없다. 로컬·테스트에는 배포 DSN·환경·release를 기본 주입하지 않아야 한다.
- `apps/app`의 공용 source에 Web SDK를 직접 import하면 PROD-483보다 먼저 native bundle과 runtime을 바꾼다. platform module 경계가 필요하다.
- Expo Web source map을 그대로 정적 root에 복사하면 원본 source가 공개된다. 업로드는 gzip과 runtime image 복사보다 먼저 끝나야 한다.
- 서버는 현재 emit된 JavaScript artifact가 없어 업로드 가능한 source map도 없다. 배포 entry artifact를 생성하는 build 단계와 runtime entrypoint 정렬이 필요하다.

### Recommended Approach

- API와 BFF는 작은 공용 server 관측 모듈을 공유하지 말고 각 앱이 같은 최소 설정을 소유한다. Sentry SDK는 DSN, environment와 release가 모두 있으면 활성화한다.
- API GraphQL plugin은 Kosmo/validation 오류를 변환만 하고 unexpected 원인만 capture한다. GraphQL 밖 API 오류와 Web BFF unexpected 오류는 각 Hono `onError`가 capture한다.
- Web platform entry가 router와 애플리케이션 module보다 먼저 browser SDK를 초기화하고 Web 전용 오류 경계 조합이 공용 React boundary에 오류 reporter context를 제공한다. 외부 GraphQL 경계와 오류를 소비하는 내부 route·session 경계의 `componentDidCatch`가 이 reporter로 capture한다. Android·iOS entry와 조합은 Sentry 관측 module을 import하지 않는다.
- `beforeSend` event processor를 두지 않고 SDK event 전체를 전달한다. environment/release/runtime metadata는 유지하고 자동 breadcrumb와 Web session tracking은 전부 비활성화한다.
- Docker build는 Sentry를 애플리케이션 module보다 먼저 초기화하는 server entry를 production JavaScript와 external source map으로 만들고 Expo Web export에 external source map을 요청한다. Sentry CLI의 debug ID inject와 upload를 업로드 token BuildKit secret으로 수행한 뒤 map과 sourceMappingURL을 제거하고 runtime image에는 실행 JavaScript만 복사한다.
- API, Web BFF와 Web browser는 Sentry project 하나와 DSN 하나를 공유하고 `runtime` tag로 구분한다. GitHub Actions는 branch build에 dev role, 정식 SemVer tag build에 prod role을 사용해 OIDC로 Vault의 `secret/kubernetes/kosmo/shared`에서 DSN만 읽는다. GitHub repository variables의 조직·project slug와 repository secret의 upload token을 DSN과 임시 env 파일 하나로 합쳐 BuildKit secret으로 전달한다. Docker build는 DSN을 `EXPO_PUBLIC_SENTRY_DSN`으로 Web bundle에만 남기며 조직·project slug와 upload token은 source map upload 단계에서만 소비한다. API와 Web BFF는 Vault Secrets Operator가 shared의 DSN만 변환한 Kubernetes Secret을 runtime에 주입한다.

### Allowed Alternatives

- 동일한 결과와 보안 경계를 지키면 Sentry bundler plugin으로 debug ID 주입·업로드를 수행할 수 있다.
- Sentry project를 runtime별로 분리해도 동일 release와 environment/runtime tag, 자격 증명 분리와 운영 검증을 유지하면 허용한다.

### Known Traps

- DSN은 Web bundle에 공개될 수 있지만 source map 업로드 token은 공개 설정이나 Docker layer/ARG에 넣지 않는다.
- capture 전 request object나 인증 정보를 별도 scope/context에 중복 추가하지 않는다.
- request metadata, exception message, mechanism data, source context와 frame local variable는 조사 정보로 유지될 수 있으므로 애플리케이션 오류와 명시적 context에 인증 정보 또는 불필요한 사용자 콘텐츠를 넣지 않는다.
- React boundary capture와 browser 자동 capture를 별도 error wrapper로 중첩하지 않는다.
- map을 정적 root에 남기거나 공개 JavaScript에 `sourceMappingURL`을 남기지 않는다.
- 업로드 자격 증명 없는 로컬 build와 test를 실패시키지 않되, 인증된 배포 검증에서는 업로드 누락을 성공으로 간주하지 않는다.

## Risks / Trade-offs

- [SDK event에 request·browser context나 사용자 콘텐츠가 포함될 수 있다] → 기본 PII 전송과 breadcrumb·Web session tracking은 비활성화하고, 애플리케이션이 오류·context에 민감 정보를 넣지 않도록 운영 검증에서 실제 event를 확인한다.
- [서버 bundle 전환이 ESM package 동작이나 dynamic loading을 바꿀 수 있다] → production entry smoke와 API/Web 전체 test를 실행하고 문제가 있으면 emit 전략을 바꾸되 source map 계약은 유지한다.
- [하나의 image가 여러 환경에 재사용되면 Web environment가 build 시점 값과 달라질 수 있다] → 현재 branch/dev와 tag/production build가 명시적 environment build arg를 전달하고, image promotion이 도입되면 runtime config 주입을 별도 계약으로 전환한다.
- [Vault의 DSN을 바꾸면 Web bundle에는 기존 값이 남는다] → Web은 새 image를 build·배포해 변경을 반영하고, API와 Web BFF는 Vault Secrets Operator의 Secret 갱신과 rollout restart로 반영한다.
- [실제 Sentry project와 알림 rule은 저장소 밖 상태다] → 코드·build 검증과 별도로 배포 후 event, symbolication, event 전달 결과와 알림 전달 체크리스트를 완료 조건으로 남긴다.

## Migration Plan

1. SDK와 배포 metadata 기반 설정, unit test를 먼저 추가한다.
2. server/Web source map 생성과 secret 없는 로컬 build 검증을 연결한다.
3. Vault shared의 DSN, GitHub repository variables의 조직·project slug와 repository secret의 upload token을 BuildKit secret으로 전달하되, DSN은 Web의 공개 build 변수와 서버 runtime Secret으로 각각 소비한다.
4. 새 image를 배포하고 API, Web BFF, Web 검증 event를 순서대로 발생시켜 release·원본 위치·event 전달 결과를 확인한다.

## Open Questions

없음. Sentry 조직·공용 project slug, DSN과 token의 실제 값은 배포 비밀 설정이며 구현 계약을 바꾸지 않는다.
