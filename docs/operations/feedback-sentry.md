# 피드백 Sentry 접수 운영

PROD-1006은 기존 Web·Android·iOS 피드백 폼을 유지하면서 텍스트와 선택적 이미지를 Sentry User Feedback으로 통합한다. SDK의 기본 제출 동작을 사용하며 전용 첨부 API·BFF와 기존 텍스트 GraphQL mutation, Slack 직접 파일 업로드·웹훅 전달은 제거한다.

## 접수와 데이터

- 본문과 피드백 종류, 선택적 이미지 최대 3장을 함께 제출한다. 정적 JPEG·PNG·WebP, 장당 5MB·합계 15MB 제한과 원본 바이트를 유지한다.
- KOSMO DB·Media·자체 저장소에는 피드백과 첨부를 영속 저장하지 않는다. Sentry 프로젝트의 접근·보관·첨부 용량 정책을 따른다.
- 기존 [Sentry 설정](./sentry.md)의 공개 DSN·environment·release 활성화 조건을 사용한다. 업로드용 `SENTRY_AUTH_TOKEN`이나 Slack 토큰을 클라이언트에 전달하지 않는다.
- 기존 SDK 기본 진단 context를 사용한다. 이메일·인증 정보·원본 파일명 등 추가 개인정보를 명시적으로 첨부하지 않고, 자동 breadcrumb·Session Replay·자동 스크린샷 수집도 새로 켜지 않는다.
- 로컬·테스트에서는 기존과 같이 production release metadata가 기본 주입되지 않는다. SDK 미초기화 상태에서 폼은 성공으로 초기화하지 않는다.

## 제출 결과의 의미

이미지 준비와 SDK 호출이 끝나면 폼을 초기화한다. 이벤트 ID 반환은 Sentry 서버 접수 완료를 보장하지 않는다. 입력 검증·이미지 읽기·SDK 초기화 등 로컬에서 확인 가능한 오류는 draft를 보존하지만, 이후 네트워크 전송은 SDK 기본 동작에 맡긴다. 별도 접수 확인·재전송 큐·Slack fallback은 제공하지 않는다.

## Slack 알림과 요금제

Slack 알림은 필요하지만 공식 연동·요금제 선택은 이번 코드 전환과 별도의 운영 결정이다. Sentry User Feedback을 대상으로 알림 규칙을 설정하면 Slack에서 알림을 발견하고 Sentry 상세 화면에서 본문·이미지를 확인하는 흐름을 사용할 수 있다. 실제 알림 설정·도착은 아직 검증하지 않았다.

2026-09-29 확인한 [공식 요금표](https://sentry.io/pricing/)에서 Developer는 이용 인원 1명, 첨부 용량 1GB와 이메일 알림을 제공하며, 공식 Slack 등 타사 연동은 Team 이상이다. 소마 종료 이후 유료 유지 여부를 결정할 때 이 조건을 다시 확인한다. [피드백 자체는 이벤트 할당량에 포함되지 않지만](https://sentry.zendesk.com/hc/en-us/articles/40888938184091-Do-User-Feedback-reports-count-towards-my-quota), [스크린샷은 첨부 할당량을 사용한다](https://sentry.io/changelog/user-feedback-widget-screenshots/).

## 전환과 설정 정리

- 사용자 승인에 따라 구버전용 `submitFeedback` API를 남기지 않는다. 새 Native OTA를 먼저 배포하고 API 제거를 진행한다. OTA가 아직 적용되지 않은 실행 중·오프라인 앱에서는 피드백 제출이 일시적으로 실패할 수 있다. 이번 변경 자체가 OTA·운영 배포 완료를 의미하지 않는다.
- Web도 새 클라이언트와 API 변경을 함께 배포한다. 열린 구버전 탭은 새로고침 전까지 기존 제출 경로를 사용할 수 있다.
- Vault의 `SLACK_FEEDBACK_WEBHOOK_URL`, `SLACK_FEEDBACK_BOT_TOKEN`, `SLACK_FEEDBACK_CHANNEL_ID`는 새 피드백 구현에서 소비하지 않는다. 이 작업은 Vault 값을 삭제하거나 토큰을 폐기하지 않는다. `SLACK_FEEDBACK_WEBHOOK_URL`은 콘텐츠 신고 전송에서도 사용하므로 유지해야 한다. Bot Token·채널 ID는 구버전 workload와 다른 사용처를 확인한 뒤 별도로 정리한다.
- 검증 결과는 자동 테스트·Web 런타임·Native 런타임·실제 Sentry 접수·Slack 알림을 구분해 기록한다. 로컬 mock 통과를 실제 외부 접수나 운영 알림 확인으로 기록하지 않는다.
