# Sentry 오류 수집 운영

Kosmo는 API, Web BFF와 Web browser의 처리되지 않은 오류만 Sentry에 수집한다. BFF에서는 예상된 4xx 인증 거절을 제외하되 설정 누락·upstream 실패 같은 5xx 인증 경로 오류는 수집하고, Web에서는 외부 GraphQL 경계와 오류를 소비하는 내부 route·session 경계를 모두 수집한다. Web 자동 session tracking도 비활성화한다. Android·iOS 수집과 native debug symbol은 PROD-483 범위이며 현재 연결하지 않는다. Prometheus SLI/SLO, tracing, Session Replay와 사용자 행동 분석도 이 설정의 범위가 아니다.

## Project와 자격 증명

GitHub Actions repository variable에는 다음 공개·비밀이 아닌 값을 둔다.

| 이름                     | 용도                                       |
| ------------------------ | ------------------------------------------ |
| `SENTRY_ORG`             | Sentry organization slug                   |
| `SENTRY_API_PROJECT`     | API source map을 받을 project slug         |
| `SENTRY_WEB_BFF_PROJECT` | Web BFF source map을 받을 project slug     |
| `SENTRY_WEB_PROJECT`     | Web browser source map을 받을 project slug |
| `EXPO_PUBLIC_SENTRY_DSN` | Web bundle에 포함되는 공개 ingest DSN      |

세 project를 하나로 운영하면 세 project variable에 같은 slug를 사용한다. Runtime별로 분리하면 각각 대응하는 slug와 DSN을 사용한다.

GitHub Actions secret `SENTRY_AUTH_TOKEN`에는 source map 업로드와 release artifact 생성 권한만 가진 organization token을 둔다. 이 token은 Docker BuildKit secret mount로만 전달되며 Docker ARG, image layer와 Web bundle에 포함하지 않는다.

Vault의 `secret/kubernetes/kosmo/<environment>`에는 다음 runtime secret을 둔다.

- `SENTRY_API_DSN`: API project ingest DSN
- `SENTRY_WEB_BFF_DSN`: Web BFF project ingest DSN

두 서버가 같은 project를 사용하면 기존 호환 key인 `SENTRY_DSN` 하나를 대신 사용할 수 있다. DSN은 인증 token이 아니지만 server 설정은 runtime secret으로 관리한다. `SENTRY_ENABLED=1`, `SENTRY_ENVIRONMENT`와 commit 기반 `SENTRY_RELEASE`는 Helm과 image가 주입한다. 네 값 중 하나라도 없으면 해당 runtime은 event를 전송하지 않는다.

## 개인정보 제거 정책

수집 event는 다음 정보를 유지한다.

- Sentry SDK가 만든 exception 전체(values, type, message, mechanism, stack frame과 frame metadata)
- source map debug ID
- environment와 `kosmo@<commit-sha>` release
- `api`, `web-bff`, `web` runtime tag

다음 top-level 정보는 `beforeSend`와 `beforeBreadcrumb`에서 제거한다.

- Authorization header, cookie, session과 bearer token
- request body와 query string
- GraphQL document, operation variables와 response data
- 구조화된 사용자 작성 콘텐츠와 request payload
- user, extra, context와 모든 자동 console·network·navigation·UI breadcrumb

Sentry의 기본 개인정보 전송도 활성화하지 않는다. Exception은 SDK가 구성한 값을 그대로 유지하므로 message, mechanism data, source context와 frame local variable에 인증 정보, request payload 또는 사용자 작성 콘텐츠가 포함될 수 있다. 이는 오류 추적 정보를 보존하기 위해 수용한 범위이며, 애플리케이션 오류와 local variable에 민감 값을 넣지 않아야 한다. 새 top-level tag, context 또는 breadcrumb가 필요하면 허용할 값과 사용자 콘텐츠 포함 가능성을 먼저 검토하고 이 문서와 redaction test를 함께 갱신한다.

## Build와 source map

`pnpm build:sentry-artifacts`는 API와 Web BFF JavaScript, Expo Web bundle과 external source map을 생성한다. 이어서 debug ID를 주입하고 source map의 `sourcesContent`를 정적으로 검증한다. 업로드 설정이 없는 로컬 실행은 외부 전송을 건너뛰지만 검증 뒤 map과 공개 JavaScript의 `sourceMappingURL`을 제거한다.

`Docker Build` workflow는 commit release와 project slug를 build arg로 전달하고 업로드 token만 BuildKit secret으로 전달한다. CI에서는 `SENTRY_UPLOAD_REQUIRED=1`이므로 token, organization, release 또는 project가 누락되면 image build가 실패한다. 업로드가 성공한 뒤 runtime image와 Web static root에는 `.map` 파일이 남지 않는다.

로컬에서 artifact 보안 경계를 확인한다.

```sh
pnpm build:sentry-artifacts
find apps/api/dist apps/web/dist apps/app/dist -name '*.map' -print
rg 'sourceMappingURL=|SENTRY_AUTH_TOKEN' apps/api/dist apps/web/dist apps/app/dist
```

두 검색은 결과가 없어야 한다. generated `dist`는 커밋하지 않는다.

## 배포 후 검증

새 release마다 실제 서비스에 상시 검증 route나 오류 button을 남기지 않는다. 임시 검증 branch에서 기존 전역 경계까지 도달하는 오류를 만들고 배포한 뒤 확인 즉시 제거한다.

1. API GraphQL resolver에서 예상하지 못한 `Error`를 한 번 발생시키고 `api` event가 기존 `INTERNAL_SERVER_ERROR` 응답과 함께 한 번만 수집되는지 확인한다.
2. Web BFF route에서 예상하지 못한 `Error`를 발생시키고 `web-bff` event와 기존 500 응답을 확인한다.
3. Web React boundary 아래에서 render 오류를 발생시키고 기존 오류 화면·재시도와 `web` event를 확인한다.
4. 세 event의 environment, runtime tag와 `kosmo@<같은 commit-sha>` release가 일치하는지 확인한다.
5. 각 stack이 원본 TypeScript·React 파일과 행으로 symbolicate되는지 확인한다.
6. event JSON에서 Sentry exception payload는 그대로 유지되고 top-level request, user, extra, context와 breadcrumb는 없는지 확인한다.
7. Sentry project의 새 issue 알림이 운영 채널로 전달되는지 확인한다.

실제 event와 알림 증거가 없으면 PROD-477의 통합 검증과 OpenSpec archive를 완료하지 않는다.

## Triage

새 Sentry issue를 확인한 운영자는 environment와 release를 먼저 확인해 현재 배포인지 판단한다. stack의 첫 Kosmo source frame으로 owning runtime과 영역을 식별하고 재현 가능성, 영향 사용자 여정과 발생량을 기록해 프로덕트 팀 Linear issue를 만든다. Linear issue에는 Sentry issue URL, 최초·최근 발생 시각, environment/release/runtime, redacted stack 위치와 재현 절차를 첨부한다. 인증 정보, request payload, 사용자 콘텐츠를 Linear로 복사하지 않는다.

이미 담당 issue가 있으면 새 issue를 만들지 않고 Sentry link와 최신 release 증거를 기존 issue에 추가한다. 오류가 예상 도메인 실패이거나 중복 경계 보고라면 SDK 필터·경계 회귀로 분류한다.

## 중단과 rollback

수집 문제나 개인정보 위험이 있으면 Vault의 해당 DSN을 제거하거나 Helm의 `SENTRY_ENABLED`를 비활성화해 event 전송부터 중단한다. Sentry 초기화가 비활성화돼도 기존 API/BFF 응답과 Web 오류 UI는 유지된다. source map 업로드 token은 GitHub secret에서 회전하거나 제거한다.
