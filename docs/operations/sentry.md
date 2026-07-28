# Sentry 오류 수집 운영

Kosmo는 API, Web BFF와 Web browser의 처리되지 않은 오류만 Sentry에 수집한다. BFF에서는 예상된 4xx 인증 거절을 제외하되 설정 누락·upstream 실패 같은 5xx 인증 경로 오류는 수집하고, Web에서는 외부 GraphQL 경계와 오류를 소비하는 내부 route·session 경계를 모두 수집한다. Web 자동 session tracking도 비활성화한다. Android·iOS 수집과 native debug symbol은 PROD-483 범위이며 현재 연결하지 않는다. Prometheus SLI/SLO, tracing, Session Replay와 사용자 행동 분석도 이 설정의 범위가 아니다.

## Project와 자격 증명

Vault의 `secret/kubernetes/kosmo/shared`에는 환경과 무관한 Sentry 설정을 둔다. API, Web BFF와 Web browser는 Sentry의 `kosmo` project 하나를 공유하고 `runtime` tag로 구분한다. `byulmaru/kosmo`의 branch와 release tag GitHub OIDC subject는 image build에 필요한 값을 읽는다.

| 이름                | 용도                                      |
| ------------------- | ----------------------------------------- |
| `SENTRY_ORG`        | Sentry organization slug                  |
| `SENTRY_PROJECT`    | 세 runtime source map을 받을 project slug |
| `SENTRY_DSN`        | 세 runtime이 공유하는 공개 ingest DSN     |
| `SENTRY_AUTH_TOKEN` | source map 업로드용 organization token    |

Workflow는 Vault의 Sentry 설정 객체 전체를 임시 env 파일 하나로 만들고 `sentry_config` BuildKit secret으로 Docker build에 한 번 전달한다. Docker build의 artifact 생성 단계가 이 파일을 환경 변수로 읽는다. DSN은 `EXPO_PUBLIC_SENTRY_DSN`으로 Web bundle에만 넣고, organization·project slug와 token은 source map upload 단계에서만 사용한다. DSN은 공개 ingest endpoint이므로 browser bundle에 포함될 수 있다.

`SENTRY_AUTH_TOKEN`에는 source map 업로드와 release artifact 생성 권한만 가진 organization token을 둔다. Vault JSON 전체는 Docker BuildKit secret mount에서만 보이며 layer에 복사하지 않는다. Token과 organization·project slug는 runtime image에 포함하지 않는다.

공용 DSN은 환경마다 다른 Sentry project를 사용하지 않으므로 `shared`에서 관리하고 event의 dev/prod 구분은 공용 `ENVIRONMENT`가 담당한다. Web build에는 같은 값을 `EXPO_PUBLIC_ENVIRONMENT`로 전달한다. API와 Web BFF에는 Vault Secrets Operator가 `shared`의 `SENTRY_DSN` 하나만 `sentry-runtime` Secret으로 변환해 배포 시 주입한다. `SENTRY_RELEASE`는 Vault 값이 아니라 workflow가 `kosmo@<Git commit SHA>`로 만드는 배포 식별자이며 event와 source map을 연결한다. DSN, environment와 release가 모두 있으면 해당 runtime은 Sentry를 활성화한다. 로컬·테스트에는 이 배포 metadata를 기본 주입하지 않는다.

## Event 전달 정책

Sentry SDK가 만든 event는 `beforeSend`에서 재구성하거나 제거하지 않고 그대로 전송한다. 따라서 다음 진단 정보를 유지한다.

- Sentry SDK가 만든 exception 전체(values, type, message, mechanism, stack frame과 frame metadata)
- source map debug ID
- environment와 `kosmo@<commit-sha>` release
- `api`, `web-bff`, `web` runtime tag
- SDK가 수집한 request, user, extra와 context

자동 breadcrumb는 `beforeBreadcrumb`에서 모두 제거한다.

- console, network, navigation과 UI breadcrumb

Sentry의 기본 개인정보 전송은 활성화하지 않지만, SDK event에는 오류 진단을 위해 request metadata, exception message, mechanism data, source context, frame local variable와 애플리케이션이 추가한 context가 포함될 수 있다. 애플리케이션 오류나 명시적 Sentry context에 인증 정보 또는 불필요한 사용자 콘텐츠를 넣지 않아야 한다.

## Build와 source map

`pnpm build:sentry-artifacts`는 API와 Web BFF JavaScript, Expo Web bundle과 external source map을 생성한다. 이어서 debug ID를 주입하고 source map의 `sourcesContent`를 정적으로 검증한다. 업로드 설정이 없는 로컬 실행은 외부 전송을 건너뛰지만 검증 뒤 map과 공개 JavaScript의 `sourceMappingURL`을 제거한다.

`Docker Build` workflow는 모든 branch에는 `kosmo-build-dev`, 정식 SemVer release tag에는 `kosmo-build-prod` Vault OIDC role을 사용해 `shared` build 설정을 읽는다. 다른 tag ref의 수동 실행은 실패한다. 따라서 기능 branch의 수동 build도 dev environment로 source map을 업로드할 수 있다. 두 role은 동일한 정확한 `shared` 경로만 read할 수 있고 token 수명도 짧지만, repository에서 branch workflow를 실행할 수 있는 주체는 source map 업로드 token을 build 중 사용할 수 있다. Workflow는 commit release와 공개 environment만 build arg로 전달하고 Vault Sentry env 파일 전체는 BuildKit secret file 하나로 전달한다. BuildKit secret 내용은 cache key가 아니므로 `app-build` stage는 cache를 사용하지 않고 매 build마다 현재 Vault 값을 읽는다. CI에서는 `SENTRY_UPLOAD_REQUIRED=1`이므로 token, DSN, organization, release 또는 project가 누락되면 image build가 실패한다. 최종 image에는 Vault 설정이나 server DSN을 남기지 않으며, 업로드가 성공한 뒤 runtime image와 Web static root에는 `.map` 파일이 남지 않는다.

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
6. event JSON에서 SDK가 만든 exception, request와 context가 누락 없이 유지되고 breadcrumb는 없는지 확인한다.
7. Sentry project의 새 issue 알림이 운영 채널로 전달되는지 확인한다.

실제 event와 알림 증거가 없으면 PROD-477의 통합 검증과 OpenSpec archive를 완료하지 않는다.

## Triage

새 Sentry issue를 확인한 운영자는 environment와 release를 먼저 확인해 현재 배포인지 판단한다. stack의 첫 Kosmo source frame으로 owning runtime과 영역을 식별하고 재현 가능성, 영향 사용자 여정과 발생량을 기록해 프로덕트 팀 Linear issue를 만든다. Linear issue에는 Sentry issue URL, 최초·최근 발생 시각, environment/release/runtime, redacted stack 위치와 재현 절차를 첨부한다. 인증 정보, request payload, 사용자 콘텐츠를 Linear로 복사하지 않는다.

이미 담당 issue가 있으면 새 issue를 만들지 않고 Sentry link와 최신 release 증거를 기존 issue에 추가한다. 오류가 예상 도메인 실패이거나 중복 경계 보고라면 SDK 필터·경계 회귀로 분류한다.

## 설정 회전

Vault `shared`의 `SENTRY_DSN` 변경은 API와 Web BFF에는 Vault Secrets Operator의 Secret 갱신과 rollout restart로, Web에는 새 image build·배포로 반영된다. Source map 업로드 token은 Vault의 `secret/kubernetes/kosmo/shared`에서 회전한다.
