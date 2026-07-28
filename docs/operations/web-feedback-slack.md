# Web 피드백 Slack Webhook 운영

PROD-487의 Web 피드백은 API 서버가 Slack Incoming Webhook으로 전달한다. Web 번들,
Relay 요청, 브라우저 쿠키, API 로그에는 Webhook URL을 포함하지 않는다.

## Secret 위치

각 환경의 API 전용 Vault KV 경로에 다음 키를 저장한다.

```text
secret/kubernetes/kosmo/<env>/api
SLACK_FEEDBACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

`<env>`는 Helm의 `.Values.env`와 동일한 환경명이다. 공용 경로
`secret/kubernetes/kosmo/<env>`에 이 키를 추가하지 않는다. 공용 `env` Secret은 Web과 API
양쪽에 주입되고, API 전용 경로는 `api-env` Secret으로 변환되어 API Rollout에만 주입된다.

Webhook 값은 HTTPS `hooks.slack.com/services/...` 형식이어야 한다. URL이 없거나 형식이
잘못되면 API는 피드백을 Slack으로 보내지 않고 안전한 오류만 반환한다.

## 배포 전 확인

- `api-env` VaultStaticSecret이 API Rollout만 재시작하도록 렌더링되는지 확인한다.
- `web` Rollout에 `api-env` 또는 `SLACK_FEEDBACK_WEBHOOK_URL`이 주입되지 않는지 확인한다.
- API 이미지와 Web 번들에서 `SLACK_FEEDBACK_WEBHOOK_URL`, `hooks.slack.com/services`가
  검색되지 않는지 확인한다.
- 인증된 Web 사용자가 `/menu`에서 피드백을 제출하고, 성공 시 Slack에 정확히 한 메시지가
  도착하는지 운영 smoke에서 확인한다.

운영 smoke에서 Slack 응답이 모호하거나 실패하면 입력값을 보존한 채 Web의 명시적인
`다시 시도` 동작으로 재전송한다. API가 자동으로 재시도하지 않으므로, 중복 메시지 가능성을
확인한 뒤에만 재시도한다.
