# 피드백 Slack 전달 운영

PROD-487의 첨부 없는 피드백은 API 서버가 Slack Incoming Webhook으로 전달한다.
PROD-1006의 이미지 첨부 피드백은 API 서버가 Slack 파일 업로드 API로 본문과 이미지를 함께 전달한다.
Web·Android·iOS는 같은 인증된 피드백 경계를 사용한다. 클라이언트 번들, Relay 요청, 브라우저 쿠키,
API 로그에는 Slack Webhook URL·Bot Token·업로드 URL을 포함하지 않는다.

## 배포 Secret 구성

배포 환경은 기존 공용 `env` Secret에 다음 환경 변수를 secret으로 구성한다. Helm chart는 이 Secret을
API와 Web Rollout에 `envFrom`으로 전달하지만, Slack delivery 애플리케이션은 API만 이 값을 소비한다.

```text
SLACK_FEEDBACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_FEEDBACK_BOT_TOKEN=<Bot User OAuth Token>
SLACK_FEEDBACK_CHANNEL_ID=<피드백 채널 ID>
```

이 변경은 Helm에 전용 Vault 경로나 Secret을 추가하지 않는다. 실제 운영 주입은 production smoke 전에
기존 공용 `env` Secret에 구성한다. 공용 Secret 값은 Web process까지 전달되지만, Web 애플리케이션이나
브라우저 bundle은 이 값을 읽거나 노출하지 않는다.

첨부 없는 경로의 Webhook 값은 HTTPS `hooks.slack.com/services/...` 형식이어야 한다.
첨부 경로에는 같은 워크스페이스에 설치된 앱의 Bot User OAuth Token과 대상 채널 ID가 필요하다.
봇은 `files:write` 권한과 채널 참여가 필요하며 `xapp-` App-level Token은 사용하지 않는다.
필요한 설정이 없으면 해당 전달 경로만 안전한 오류로 실패한다. 첨부 없는 제출은 Bot Token을 요구하지 않는다.

Webhook 앱과 Bot Token 앱이 다르면 이미지 없는 피드백과 이미지 있는 피드백의 발신자가 다르게 표시된다.
동일한 발신자가 필요하면 같은 Slack 앱의 Webhook과 Bot Token을 사용한다.

로컬 `pnpm dev`는 루트 `scripts/vault-run.mjs`가 공용
`secret/kubernetes/kosmo/local` 값을 한 번 읽어 workspace process에 전달한다. API `dev` script는
별도 Vault 경로를 다시 읽거나 overlay하지 않는다. 공용 경로의 webhook 값은 API delivery만 소비하며,
Web·Expo process까지 전달되지만 Web·Expo 애플리케이션이나 browser asset은 이 값을 읽거나 inline하지 않는다.
추가 토큰·채널 키도 같은 경로에서 공급하고 API delivery만 소비한다.

운영은 Vault `secret/kubernetes/kosmo/prod`를 공용 Kubernetes `env` Secret으로 동기화한다.
설정 추가 시 기존 값을 유지하는 `vault kv patch`를 사용한다. 저장 성공은 실제 동기화·재시작·Slack 전송
성공과 구분한다. 현재 Helm 설정은 5분 주기 동기화와 관련 workload 재시작을 지정한다.

## 첨부 전달과 보관

- 최대 3장, 장당 5MB, 합계 15MB의 JPEG·PNG·WebP 정적 이미지를 받는다. MB는 1,000,000바이트이다.
- KOSMO DB나 미디어 저장소에 첨부를 영속 저장하지 않는다. 저장되는 파일은 Slack의 접근·보관 정책을 따른다.
- 서버가 `files.getUploadURLExternal`로 파일별 URL을 받아 이미지 바이트를 전송하고, 모두 성공한 뒤
  `files.completeUploadExternal`에 파일 목록과 본문을 함께 전달한다. 중간 실패하면 게시 완료를 호출하지 않는다.
  완료되지 않은 파일과 메타데이터는 [Slack 공식 계약](https://docs.slack.dev/reference/methods/files.completeUploadExternal/)에 따라 폐기된다.
- Slack API의 HTTP 성공과 응답의 `ok`를 모두 확인한다. 업로드와 완료 요청은 자동 재시도하지 않는다.
- 일부 실패에서 첨부를 누락한 텍스트만 대신 게시하지 않는다. 완료 응답 유실 뒤 명시적 재시도는 중복될 수 있다.

## 배포 전 확인

- 기존 공용 `env` Secret에 `SLACK_FEEDBACK_WEBHOOK_URL`이 구성되고 API process가 이를 읽을 수 있는지 확인한다.
- 이미지 경로의 Bot Token·채널 ID도 확인하고, 토큰의 앱과 권한·채널 참여를 값 노출 없이 검증한다.
- 운영 Gateway의 요청 크기·응답 대기 제한이 이미지 15MB와 multipart overhead, Slack 전달 시간을 허용하는지
  3장 smoke에서 확인한다. 저장소의 Web·API HTTPRoute에는 별도 크기·timeout 설정이 없으므로 운영 Gateway의
  적용값을 저장소 설정만으로 확정하지 않는다.
- `web` Rollout은 기존 공용 `env`를 계속 전달받지만, Web 애플리케이션이 해당 값을 읽거나 browser asset에
  inline하지 않는지 확인한다.
- Web bundle에서 `SLACK_FEEDBACK_WEBHOOK_URL`, `SLACK_FEEDBACK_BOT_TOKEN`, `hooks.slack.com/services` 문자열이 검색되지
  않는지 확인한다. API source/image에는 runtime 환경 키와 Slack hostname이 정상적으로
  존재할 수 있으므로 이 문자열의 부재를 검사하지 않는다.
- API source/image와 배포 산출물에는 실제 Vault secret의 exact-match와 credential-shaped
  webhook 값(예: `https://hooks.slack.com/services/<token>` 형태)이 남아 있지 않은지
  검사한다. 검사는 secret 값을 로그나 문서에 기록하지 않고 배포 단계에서 주입된 값을
  안전한 검증 도구로 비교하는 방식으로 수행한다.
- 인증된 Web 사용자가 `/feedback`에서 피드백을 제출하고, 성공 시 Slack에 정확히 한 메시지가
  도착하는지 운영 smoke에서 확인한다. 메시지에는 제출 Account 내부 ID와 선택된 Profile의 허용
  필드만 포함되고, Account `displayName`·이메일·OIDC subject·session ID·선택되지 않은 Profile은
  포함되지 않아야 한다. 관찰 가능한 API log에는 webhook URL·token·cookie·Account 내부 ID와 예상하지
  못한 오류 세부가 남지 않는지도 함께 확인한다.
- 승인된 테스트 이미지로 3장 첨부가 본문과 함께 도착하는지, 텍스트만 제출하는 기존 경로도 유지되는지
  확인한다. Web·Android·iOS 런타임 결과와 운영 Slack smoke 결과는 각각 기록한다.

운영 smoke에서 Slack 응답이 모호하거나 실패하면 입력값을 보존한 채 Web의 명시적인
`다시 시도` 동작으로 재전송한다. API가 자동으로 재시도하지 않으므로, 중복 메시지 가능성을
확인한 뒤에만 재시도한다.
