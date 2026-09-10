# 게시물·프로필 신고 Slack Webhook 운영

PROD-915의 게시물·프로필 신고는 API 서버가 제출 시점에 다시 확인한 대상 정보를 Slack Incoming Webhook으로 전달한다. Web·Android·iOS 번들, Relay 변수, 브라우저 쿠키, API 로그에는 Webhook URL이나 신고자 식별 정보를 포함하지 않는다.

## Secret 구성

기존 API 공용 환경 Secret에 다음 변수를 구성한다. 값은 API process만 소비하며 클라이언트가 읽거나 번들에 포함하지 않는다.

```text
SLACK_CONTENT_REPORT_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Webhook은 HTTPS `hooks.slack.com/services/...` 형식만 허용한다. 값이 없거나 형식이 잘못되면 API는 Slack 요청을 만들지 않고 `REJECTED`를 반환한다.

Slack payload에는 서버가 확인한 대상 종류·ID, Kosmo 링크, 원본 ActivityPub URI(있는 경우), 신고 사유, 상세 내용만 포함한다. Account/Profile ID·이름·세션·IP·OIDC 정보, 원문·미디어·미리보기, 자격 증명은 포함하지 않는다.

## 결과와 재시도

- HTTP 200 응답 본문이 `ok`일 때만 `DELIVERED`다.
- 명시적인 HTTP/Slack 실패는 `REJECTED`다.
- timeout, network error, redirect, 응답 본문 손실처럼 결과를 확인할 수 없으면 `UNKNOWN`이다.
- API는 자동 재시도하지 않는다. `UNKNOWN`은 중복 가능성을 안내하고, 사용자가 입력을 확인한 뒤 새 시도로만 재전송한다.
- 신고 결과나 draft를 durable state로 저장하지 않으며 exactly-once 전달을 주장하지 않는다.

## 배포 전 확인

- API rollout에만 `SLACK_CONTENT_REPORT_WEBHOOK_URL`이 주입되고 Web·Expo bundle에 포함되지 않는지 확인한다.
- 신고 대상이 제출 시점에 삭제되거나 접근 권한을 잃으면 Slack 요청 없이 `REJECTED`인지 확인한다.
- 정상 신고에서 Slack payload가 위 allowlist만 포함하고, API 로그에 webhook URL/token 및 개인 식별 정보가 남지 않는지 확인한다.
- 운영 smoke는 Web·Android·iOS에서 성공, 명시적 실패, 결과 불명확 후 수동 재시도와 입력 보존을 각각 확인한다.
