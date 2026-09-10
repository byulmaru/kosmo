# Post·Profile 신고

## 상태와 근거

2026-09-10 사용자 “Gate 승인. Spec 작성 시작”으로 Domain·Design·Issue 결과의 Spec 단계 전환을 승인했다. [PROD-915](https://linear.app/byulmaru/issue/PROD-915)가 Web·Android·iOS의
신고 제출과 Slack 전달 확인을 소유한다. 도메인 범위와 확정한 제출자 조건은
[ADR 0030](../domain/decisions/0030-content-report-submission.md)에 기록한다. 구현 착수에는 완성된 OpenSpec의 별도 승인이 필요하다.

## 사용자 흐름

- 로그인한 활성 Account는 Post 또는 Profile에서 신고를 시작한다. Selected Profile을 선택하지 않았다는
  이유만으로 신고 제출을 막지 않는다.
- 신고 대상은 저장된 local/remote Post·Profile 중 서버가 제출 시점에 canonical 직접 조회 권한을 확인한 대상이다. 선택된 유효 Profile을 viewer로 쓰고 미선택이면 공개 조회 범위만 적용한다. 삭제·차단으로 현재 조회 불가한 Post는 신고 대상에서 제외한다. 이 대상 범위와 viewer 기준은 2026-09-10 사용자 확정이다.
- 신고 사유는 유해·부적절한 콘텐츠, 괴롭힘·혐오·위협, 스팸·사기, 아동 안전 우려, 기타의 5개 카테고리로 받는다. 상세 설명은 선택적으로 입력하며 최대 2,000자다. `기타`만 공백이 아닌 설명을 필수로 한다.
- 신고 화면은 선택한 대상과 입력한 사유를 확인할 수 있어야 한다. 대상 종류와 신고 action을 accessible
  name으로 구분한다.
- Web·Android·iOS는 공통 API의 전달 결과에 따라 제출 중·성공·실패·전달 여부 확인 불가를 구분한다.
- 제출 중 버튼 비활성화 등으로 client의 중복 클릭·탭을 억제한다. 서버의 요청 처리 중 최소 동시 중복 억제는 사용할 수 있으나 전역 rate limit으로 안내하지 않는다.
- Slack 정상 ACK인 HTTP 200과 `ok` 확인 전에는 성공을 표시하지 않는다. 실패 후에는 입력을 유지하고 재시도할 수 있게 한다.
- timeout·connection reset·response loss 등은 `전달 여부를 확인할 수 없음`으로 안내한다. 입력을 유지하고 재시도 시 중복 가능성을 알린 뒤 수동 재시도를 허용하며 자동 재전송하지 않는다. 수동 재시도는 새 발송 시도지만 이 이슈에서 Account별 시간 구간 한도를 적용하지 않는다.
- Slack에는 대상 종류·서버 확인 ID·Kosmo 링크·remote 원본 URI·사유·상세 설명만 전달하며 신고자 식별정보와 원문·media 자동 복사는 제외한다. 입력에 개인정보가 포함될 수 있으므로 완전한 익명 신고라고 안내하지 않는다.
- 성공은 Slack 전달 확인을 뜻한다. 운영자의 검토 완료나 moderation action을 뜻하지 않는다.

## 접근성과 검증

- 공용 token과 입력·상태 표현을 사용하며, 최소 접근성은 [accessibility.md](./accessibility.md)를 따른다.
- 신고 진입점, 대상 이름, 사유 입력, 제출 action, 제출 중 상태와 결과를 보조 기술로 확인할 수 있어야 한다.
- Web은 keyboard로 신고를 열고 작성·제출할 수 있어야 한다. 열기·닫기와 결과 표시 뒤의 focus를 실행 검증한다.
- Android·iOS는 각각 실제 runtime에서 touch, focus, TalkBack·VoiceOver와 font scaling을 검증한다.
- Web 실행 결과나 공용 source 검증으로 Android·iOS 실행 증거를 대체하지 않는다.

## Native presentation 결정 · 2026-09-10

- 사용자 선택에 따라 Android/iOS 신고 form은 현재 Post·Profile 화면 위 modal/sheet로 연다. 대상 문맥을 유지하며 별도 신고 page로 이동하지 않는다.
- dirty 상태의 명시적 닫기는 폐기 확인을 거치며 취소하면 계속 작성한다. 제출 중 명시적 닫기·중복 조작을 차단하고 실패·전달 여부 확인 불가 상태에서는 입력을 유지한다.
- keyboard·스크롤·닫기 callback과 지원하는 dismissal 경로를 공용 경계에 연결하고 Android/iOS 각각에서 실제 동작과 접근성을 검증한다. 이 검증은 구현 책임이며 presentation을 다시 정할 Domain 질문이 아니다.
- Domain/Design의 남은 제품 선택은 없으며 2026-09-10 Gate 전환 승인을 받았다.

## 재사용할 lifecycle 선례

[Feedback Design](./feedback.md)의 Web overlay/form lifecycle과 [접근성 계약](./accessibility.md)을 적용한다.
이는 feedback의 Slack payload·인증·전달 실패 의미를 재사용한다는 뜻이 아니다.

- Web의 반응형 dialog/sheet, dirty 상태의 명시적 닫기 시 폐기 확인, 취소 시 계속 작성, 폐기 후 재열기 시 새 draft를 적용한다. durable draft 복원은 요구하지 않는다.
- 제출 중 입력·제출·명시적 닫기를 차단하고, 실패·불확실 결과에서는 기존 확정 계약대로 입력을 유지한다. 성공 후 입력은 초기화하고 성공 결과는 화면에 남긴다.
- 작성 도중 대상이 삭제되거나 권한을 잃어도 확정된 대상 정책을 바꾸지 않는다. 제출 시 서버 재검증으로 발송을 거절하며 draft는 실패 상태의 입력 유지 원칙을 따른다. 작성 중 실시간 감지·버튼 상태 갱신 방법은 구현 세부사항이다.
- Web focus trap·복귀와 유효한 fallback, Native dismiss callback·pending 차단 연결 및 실제 플랫폼 접근성 검증은 구현·검증 책임이다. Native gesture를 지원하면 동일한 close 경계를 통과시켜야 하며 저장되지 않은 전송 취소를 약속하지 않는다.
- 성공·실패·확인 불가의 정확한 의미를 바꾸지 않는 문구, 문자 수 계산의 client/server 일치, keyboard 및 layout 세부 조정은 구현 단계에서 구체화한다.

## 제외 범위

신고 처리 상태 목록, 관리자 화면, 자동 moderation과 운영절차는 만들지 않는다. 계획 단계에서 실제 Slack
메시지를 발송하지 않는다.

Account별 `N회 / 시간 구간`, 모든 API replica의 공유 rate limit, Redis/Valkey 등 공유 제한 인프라,
장기 중복·반복 신고·다계정 탐지와 신고 이력 기반 제한은 제외한다. Server-side distributed abuse/rate
limiting은 별도 후속 이슈 책임이며 PROD-915 완료 조건이 아니다. 후속 이슈는 생성 승인 전이다.

## Slack 연결 결정 · 2026-09-10

사용자 결정에 따라 Feedback과 같은 Slack 봇·채널을 사용한다. 기존 공용 `env` Secret의 `SLACK_FEEDBACK_WEBHOOK_URL`을 재사용하며 신고 전용 환경 변수나 Secret은 추가하지 않는다. 공용 Secret은 API·Web 서버에 전달될 수 있지만 신고 전송은 API만 수행하며 Web application·browser·native bundle에서 credential을 소비하거나 노출하지 않는다.

신고 메시지는 고정된 `text`와 `plain_text` Block Kit으로 구분하고 대상·사유·상세 설명을 표시한다. 링크·media unfurl은 끈다. Feedback의 신고자 식별정보나 전달 성공 판정은 재사용하지 않으며 기존 신고 ACK·확인 불가·비영속 계약을 유지한다.
