# Web 피드백 Slack Webhook 운영

PROD-487의 Web 피드백은 API 서버가 Slack Incoming Webhook으로 전달한다. Web 번들,
Relay 요청, 브라우저 쿠키, API 로그에는 Webhook URL을 포함하지 않는다.

## 배포 Secret 구성

배포 환경은 API process에만 다음 환경 변수를 secret으로 주입해야 한다.

```text
SLACK_FEEDBACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

이 변경은 Helm에 전용 Vault 경로나 Secret을 추가하지 않는다. 실제 운영 주입은 production smoke 전에
배포 환경에서 별도로 구성하며, Web과 API가 함께 읽는 공용 `env` Secret에는 webhook을 추가하지 않는다.

Webhook 값은 HTTPS `hooks.slack.com/services/...` 형식이어야 한다. URL이 없거나 형식이
잘못되면 API는 피드백을 Slack으로 보내지 않고 안전한 오류만 반환한다.

로컬 `pnpm dev`는 루트 `scripts/vault-run.mjs`가 공용
`secret/kubernetes/kosmo/local` 값을 한 번 읽어 workspace process에 전달한다. API `dev` script는
별도 Vault 경로를 다시 읽거나 overlay하지 않는다. Web·Expo process에도 전달되는 공용 경로에는 webhook을
추가하지 않으며, 로컬 설정이 없으면 feedback mutation만 fail closed로 실패한다.

## 배포 전 확인

- API process에만 `SLACK_FEEDBACK_WEBHOOK_URL`이 주입되는지 확인한다.
- `web` Rollout에 `SLACK_FEEDBACK_WEBHOOK_URL`이 주입되지 않는지 확인한다.
- Web bundle에서 `SLACK_FEEDBACK_WEBHOOK_URL`, `hooks.slack.com/services` 문자열이 검색되지
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

운영 smoke에서 Slack 응답이 모호하거나 실패하면 입력값을 보존한 채 Web의 명시적인
`다시 시도` 동작으로 재전송한다. API가 자동으로 재시도하지 않으므로, 중복 메시지 가능성을
확인한 뒤에만 재시도한다.
