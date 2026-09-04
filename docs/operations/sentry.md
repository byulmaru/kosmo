# Sentry 오류 수집 운영

Kosmo는 API, Web BFF와 Web browser의 처리되지 않은 오류만 Sentry에 수집한다. BFF에서는 예상된 4xx 인증 거절을 제외하되 설정 누락·upstream 실패 같은 5xx 인증 경로 오류는 수집하고, Web에서는 외부 GraphQL 경계와 오류를 소비하는 내부 route·session 경계를 모두 수집한다. Web 자동 session tracking도 비활성화한다. Android·iOS 수집과 native debug symbol은 PROD-483 범위이며 현재 연결하지 않는다. Prometheus SLI/SLO, tracing, Session Replay와 사용자 행동 분석도 이 설정의 범위가 아니다.

## Project와 자격 증명

브라우저의 공개 Sentry DSN은 코드 공개 설정표로 관리하고, 선택된 `dev`·`prod` 채널의 Sentry environment와 함께 사용한다. API와 Web BFF의 server runtime은 기존 일반 Vault 객체와 `env` Kubernetes Secret의 `EXPO_PUBLIC_SENTRY_DSN`을 계속 사용한다. 두 경계는 같은 공개 ingest DSN을 사용할 수 있지만 client bundle 설정과 server runtime Secret의 수명·전달 경계는 분리한다. API, Web BFF와 Web browser는 Sentry의 `kosmo` project 하나를 공유하고 `runtime` tag로 구분한다. `main` push의 canonical Docker Build가 target commit SHA를 release로 사용해 image와 source map을 한 번 생성·업로드한다. `byulmaru/kosmo`의 `main` ref `workflow_dispatch` production release는 그 canonical build run과 보존된 digest manifest artifact를 preflight로 검증하고, `prod` Environment 승인 뒤 같은 digest만 배포한다. Production release에서 target image를 다시 build하거나 source map을 다시 upload하지 않는다. `target_sha`를 입력하면 해당 SHA를, 비워 두면 preflight가 확정한 최신 `main` SHA를 target으로 사용한다. 승인 전에는 production source checkout·credential 접근·build를 하지 않으며, tag push와 `production` branch push는 production release를 선택하지 않는다. Source map upload metadata와 token은 canonical Docker Build에만 GitHub repository 설정으로 주입한다.

| 이름                     | 저장 위치                             | 용도                                       |
| ------------------------ | ------------------------------------- | ------------------------------------------ |
| `SENTRY_ORG`             | GitHub repository variable            | Sentry organization slug                   |
| `SENTRY_PROJECT`         | GitHub repository variable            | Web source map을 받을 project slug         |
| browser Sentry DSN       | 코드 공개 설정표의 공용값             | Web bundle의 공개 ingest DSN               |
| `EXPO_PUBLIC_SENTRY_DSN` | 기존 환경별 Vault 객체와 `env` Secret | API/Web BFF server runtime ingest DSN      |
| `SENTRY_AUTH_TOKEN`      | GitHub repository secret              | Web source map 업로드용 organization token |

Canonical Docker Build workflow는 공개 client 설정을 Vault나 GitHub Variables에서 읽거나 Docker build arg로 주입하지 않는다. 코드 설정표가 Web bundle에 포함되고, GitHub repository variables의 `SENTRY_ORG`·`SENTRY_PROJECT`는 canonical source map upload metadata로, repository secret의 `SENTRY_AUTH_TOKEN`은 canonical `secret-envs`를 통한 BuildKit secret으로만 전달한다. 브라우저 DSN은 공개 ingest endpoint이므로 bundle에 포함될 수 있지만 client secret이나 upload credential은 포함하지 않는다.

GitHub repository secret `SENTRY_AUTH_TOKEN`에는 source map 업로드와 release artifact 생성 권한만 가진 organization token을 둔다. Token은 canonical artifact build의 해당 `RUN`에서 환경 변수 secret mount로만 보이며 layer에 복사하지 않는다. Organization·project slug는 공개 build metadata이지만 token과 함께 runtime image에는 포함하지 않는다.

Vault Secrets Operator는 환경별 Vault 객체 전체를 기존 `env` Kubernetes Secret으로 변환하고, API와 Web BFF server runtime은 여기서 기존 `EXPO_PUBLIC_SENTRY_DSN`을 읽는다. Web rollout은 Helm의 `dev`·`prod` 환경값을 `ENVIRONMENT`로 전달하고, BFF의 same-origin `/channel.js`가 이를 검증해 client가 코드 설정표의 채널을 선택하게 한다. Event의 dev/prod 구분은 선택된 채널에서 파생한 browser environment와 server의 `ENVIRONMENT`가 담당한다. `Docker Build`의 `SENTRY_RELEASE`는 dispatch의 `github.sha`가 아니라 canonical main build run의 target SHA를 사용해 `kosmo@<target commit SHA>`로 만들고, production release는 그 값을 가진 동일 image digest를 승격한다. 이 release 값은 event와 source map을 연결한다. DSN, environment와 release가 모두 있으면 해당 runtime은 Sentry를 활성화한다. 로컬·테스트에는 production build metadata를 기본 주입하지 않는다.

### Channel 공개 설정과 production 전환

공개 client 설정은 다음 순서로 전환하며, 실제 배포 증거 없이 production 완료로 기록하지 않는다.

1. 코드 공개 설정표에 공용값과 완전한 `dev`·`prod` 채널 설정을 반영하고, 공개값·credential·release metadata의 경계를 review한다.
2. Helm dev/prod render와 Web rollout에서 `ENVIRONMENT`가 올바른 채널로 전달되고, `/channel.js`가 유효한 채널에는 `public, max-age=300`, invalid/missing 환경에는 500과 `no-store`로 응답하는지 확인한다.
3. 먼저 `main` canonical Docker Build가 Web bundle의 Sentry release/source map을 생성·검증·업로드하고 보존된 image digest manifest artifact를 발행하는지 확인한다. Dev는 그 build run의 digest를 사용한다. 이후 `main`의 `workflow_dispatch`를 target SHA로 실행하고 preflight 검증과 `prod` Environment 승인 뒤 Web을 같은 digest로 배포한다. Production Web build나 source map upload는 수행하지 않는다.
4. Production browser에서 `/channel.js`, 채널별 origin·OIDC·Sentry 동작을 확인하고, Android/iOS release binary가 `prod` 설정과 native login을 사용하는지 확인한다.
5. 위 증거가 모두 있은 뒤 별도 검토된 cleanup에서 더 이상 사용하지 않는 GitHub `EXPO_PUBLIC_*` variables를 제거한다. API/Web BFF server runtime이 사용하는 기존 `env` Secret의 Sentry DSN은 이 client 설정 정리의 대상이 아니다.

## Event 전달 정책

Sentry SDK가 만든 event는 `beforeSend`에서 재구성하거나 제거하지 않고 그대로 전송한다. 따라서 다음 진단 정보를 유지한다.

- Sentry SDK가 만든 exception 전체(values, type, message, mechanism, stack frame과 frame metadata)
- Web event의 source map debug ID
- environment와 `kosmo@<commit-sha>` release
- `api`, `web-bff`, `web` runtime tag
- SDK가 수집한 request, user, extra와 context

자동 breadcrumb는 `beforeBreadcrumb`에서 모두 제거한다.

- console, network, navigation과 UI breadcrumb

### ActivityPub inbound 처리 실패

Production Web BFF의 Fedify inbox listener가 처리한 inbound ActivityPub 실패는 전역 HTTP 오류 경계와
별도의 공통 관측 경계를 따른다. `packages/fedify/src/inbound-accept.ts`, `inbound-announce.ts`,
`inbound-create.ts`/`inbound-create-note.ts`, `inbound-delete.ts`, `inbound-follow.ts`,
`inbound-reaction.ts`, `inbound-reject.ts`와 `inbound-update.ts`의 `suppressError`, 예상 오류 catch,
projection 및 post-commit delivery 경계를 inventory로 유지한다. Listener 등록은
`packages/fedify/src/federation.ts`에서 같은 경계를 통과한다.

| 분류                 | 구체적인 예시·reason code                                                                                                                                                                                                                                               | 구조화 로그 | Sentry                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------- |
| 보안·정책 거절       | malformed/foreign/mismatched activity, `invalid_*`, `*_projection_rejected`                                                                                                                                                                                             | 1회 기록    | 기록하지 않음                       |
| 멱등·현재 상태 no-op | 없는 대상, 이미 처리된 관계, `duplicate_pending_follow_noop`, `duplicate_established_follow_noop`, `duplicate_accept_noop`, `accept_follow_state_changed_noop`, `reject_follow_state_changed_noop`, `announce_undo_ignored`                                             | 1회 기록    | 기록하지 않음                       |
| 명시된 외부 실패     | remote 5xx/timeout/DNS, document·actor lookup, protocol 해석·delivery 실패, `delete_object_lookup_failed`, `*_object_lookup_failed`, `external_listener_error`                                                                                                          | 1회 기록    | 기록하지 않음                       |
| Kosmo 내부 오류      | DB projection, post-commit effect, inbound Reaction Effects Workflow start(`reaction_notification_effect_failed`, `reaction_undo_notification_effect_failed`), `follow_notification_effect_failed`, typed listener의 예상하지 못한 `Error`, `unexpected_listener_error` | 1회 기록    | 기존 runtime reporter로 1회 capture |

오류 분류의 경계는 다음과 같다.

- 외부 실패는 `AbortError`, `FetchError`, `RemoteActorMaterializationError`, `SendActivityError`,
  `UrlError`, `WebFingerError`라는 명시된 remote error name(또는 그 `cause`)으로만 판단한다. `ECONNREFUSED`,
  `ECONNRESET` 같은 generic `error.code`만으로는 외부 오류라고 추정하지 않는다. 예를 들어 typed
  handler가 `code = "ECONNREFUSED"`인 일반 `Error`를 던지면 내부 오류로 Sentry에 capture한다.
- Fedify가 typed listener에 도달하기 전 request JSON을 파싱하다 던진 `SyntaxError`는
  `federation.ts`의 관측되지 않은 `onError` 경계에서 malformed body 외부 실패로 로그만 남긴다.
  `withInboundObservability`가 typed listener 오류를 먼저 observed로 표시하므로 typed handler 안에서
  발생한 `SyntaxError`는 이 예외에 해당하지 않고 내부 오류로 capture한다.
- raw Activity JSON, signature/key material, credential과 불필요한 개인정보를 로그·context에 넣지 않는다.
  URI는 필요한 경우 origin 수준 context로만 남기며 tag/fingerprint에는 넣지 않는다.

Inbound Reaction transaction 뒤 Effects Workflow start 실패는 Create의
`reaction_notification_effect_failed` 또는 Undo의 `reaction_undo_notification_effect_failed` reason으로
Web BFF inbound reporter가 기존과 같이 1회 capture하고, committed Reaction과 inbox 처리 성공을 바꾸지
않는다. 반면 accepted Reaction Effects Workflow의 terminal Activity 실패와 retry/restart 이력은 Temporal
history와 Worker runtime 경계가 소유한다. 이 Worker 경계는 Web BFF inbound reporter의 중복 Sentry capture
대상이 아니다.

Sentry의 기본 개인정보 전송은 활성화하지 않지만, SDK event에는 오류 진단을 위해 request metadata, exception message, mechanism data, source context, frame local variable와 애플리케이션이 추가한 context가 포함될 수 있다. 애플리케이션 오류나 명시적 Sentry context에 인증 정보 또는 불필요한 사용자 콘텐츠를 넣지 않아야 한다.

## Build와 source map

`pnpm build:sentry-artifacts`는 Expo Web bundle과 external source map을 생성한다. 이어서 debug ID를 주입하고 source map의 `sourcesContent`를 정적으로 검증한다. 업로드 설정이 없는 로컬 실행은 외부 전송을 건너뛰지만 검증 뒤 map과 공개 JavaScript의 `sourceMappingURL`을 제거한다. API와 Web BFF는 기존 TypeScript source를 `tsx`로 직접 실행하며, server JavaScript/source map과 원본 TypeScript symbolication은 Backlog PROD-516에서 다룬다.

`Docker Build` workflow는 GitHub-hosted `ubuntu-24.04-arm` runner에서 `main` push마다 canonical image를 한 번 build하고, Web bundle의 Sentry release/source map을 생성·검증·업로드한 뒤 보존된 immutable digest manifest artifact를 발행한다. Dev와 production은 이 same-digest image를 사용한다. Production `workflow_dispatch`는 target SHA에 해당하는 성공한 canonical Docker Build run과 보존된 manifest artifact를 preflight로 검증하고, `prod` Environment 승인 뒤 image checkout·build·push나 source map upload 없이 그 digest만 배포한다. 두 경로 모두 공개 client 설정을 Vault나 GitHub Variables에서 읽지 않으며, 코드의 채널 설정표가 Web bundle에 포함된다. Web runtime의 `ENVIRONMENT`는 Helm 값에서 주입되고 BFF의 same-origin `/channel.js`가 이를 검증해 bundle보다 먼저 채널을 선택한다. Sentry organization·project는 canonical build metadata로, repository secret의 `SENTRY_AUTH_TOKEN`은 canonical BuildKit secret mount로만 전달한다. `SENTRY_UPLOAD_REQUIRED=1`인 canonical CI에서는 token, organization, release 또는 project가 누락되면 source map upload와 image build가 실패한다. 최종 image에는 upload token이나 organization/project 설정을 남기지 않으며, 업로드가 성공한 뒤 Web static root에는 `.map` 파일이 남지 않는다. Tag push·`production` branch push·일반 branch push는 Docker Build나 production release를 시작하지 않는다.

로컬에서 artifact 보안 경계를 확인한다.

```sh
pnpm build:sentry-artifacts
find apps/app/dist -name '*.map' -print
rg 'sourceMappingURL=|SENTRY_AUTH_TOKEN' apps/app/dist
```

두 검색은 결과가 없어야 한다. generated `dist`는 커밋하지 않는다.

## 배포 후 검증

각 [Production release](./production-release.md) 뒤 실제 서비스에 상시 검증 route나 오류 button을 남기지 않는다. 임시 검증 branch에서 기존 전역 경계까지 도달하는 오류를 만들고 배포한 뒤 확인 즉시 제거한다.

1. API GraphQL resolver에서 예상하지 못한 `Error`를 한 번 발생시키고 `api` event가 기존 `INTERNAL_SERVER_ERROR` 응답과 함께 한 번만 수집되는지 확인한다.
2. Web BFF route에서 예상하지 못한 `Error`를 발생시키고 `web-bff` event와 기존 500 응답을 확인한다.
3. Web React boundary 아래에서 render 오류를 발생시키고 기존 오류 화면·재시도와 `web` event를 확인한다.
4. 세 event의 environment, runtime tag와 `kosmo@<같은 commit-sha>` release가 일치하는지 확인한다.
5. Web stack이 원본 TypeScript·React 파일과 행으로 symbolicate되는지 확인한다. 서버 원본 TypeScript symbolication은 PROD-516에서 확인한다.
6. event JSON에서 SDK가 만든 exception, request와 context가 누락 없이 유지되고 breadcrumb는 없는지 확인한다.
7. Sentry project의 새 issue 알림이 운영 채널로 전달되는지 확인한다.

실제 event와 알림 증거가 없으면 PROD-477의 통합 검증과 OpenSpec archive를 완료하지 않는다.

## Triage

새 Sentry issue를 확인한 운영자는 environment와 release를 먼저 확인해 현재 배포인지 판단한다. stack의 첫 Kosmo source frame으로 owning runtime과 영역을 식별하고 재현 가능성, 영향 사용자 여정과 발생량을 기록해 프로덕트 팀 Linear issue를 만든다. Linear issue에는 Sentry issue URL, 최초·최근 발생 시각, environment/release/runtime, redacted stack 위치와 재현 절차를 첨부한다. 인증 정보, request payload, 사용자 콘텐츠를 Linear로 복사하지 않는다.

이미 담당 issue가 있으면 새 issue를 만들지 않고 Sentry link와 최신 release 증거를 기존 issue에 추가한다. 오류가 예상 도메인 실패이거나 중복 경계 보고라면 SDK 필터·경계 회귀로 분류한다.

## 설정 회전

브라우저 Sentry DSN 변경은 코드 공개 설정표를 검토된 변경으로 갱신하고 `main` canonical Docker Build가 새 bundle·source map을 생성한 뒤, `workflow_dispatch`로 target을 선택하고 `prod` 승인 후 같은 digest를 배포한다. 이미 배포된 정적 bundle의 DSN은 server runtime 환경 변수 변경만으로 바뀌지 않는다. API/Web BFF server runtime DSN은 기존 환경별 Vault 객체와 `env` Secret을 갱신하고 rollout restart로 반영한다. Source map 업로드 token은 GitHub repository secret `SENTRY_AUTH_TOKEN`에서 회전한다.
