## 1. PROD-915 신고 API 자격과 입력

**Authority / Provenance**

`docs/domain/decisions/0030-content-report-submission.md`, `docs/domain/objects/account.md`, `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915).

**Deliverable**

활성 Account가 선택된 viewer 또는 미선택 공개 조회 기준으로 저장된 대상을 신고하고 유효한 사유·설명만 제출한다.

**Guardrails**

Selected Profile을 강제하지 않는다. 제출 때 대상 권한을 다시 확인하며 신고 전용 policy·remote fetch를 만들지 않는다. 공통 Block 결과의 완전한 통합 증거는 5번에서 확인하고 불완전한 main predicate를 완료 근거로 삼지 않는다.

**Verification**

인증 실패·비활성 Account·미선택 공개 범위·viewer 전환·다른 소유 Profile 권한 비대여·잘못된 대상·사유·빈 기타 설명·2,000자 경계를 실제 API 입력과 발송 여부로 검증한다.

- [x] 1.1 인증·optional viewer·저장 대상 해석과 공통 직접 조회 검증을 연결한 additive 신고 API를 제공한다. (`content-report.test.ts`: selected/no-selected viewer, stored Post/Profile, submit-time target check)
- [x] 1.2 승인된 5개 사유와 설명 검증을 client/server가 일치시킬 수 있도록 제공하고 경계 동작을 검증한다. (공유 Zod schema와 2,000자·`OTHER` 경계 테스트)
- [x] 1.3 권한·대상·입력 오류에서 Slack을 호출하지 않는 API 회귀와 기존 호출자 호환성을 확인한다. (anonymous, deleted target, invalid `OTHER`, additive GraphQL schema)

## 2. PROD-915 Slack 전달과 Privacy

**Authority / Provenance**

`docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915).

**Deliverable**

최소 대상·사유 payload를 안전하게 전송하고 정상 ACK·명시적 실패·확인 불가를 구분한다.

**Guardrails**

신고자 식별정보·자동 원문/media 복사·preview·credential 노출을 막는다. 자동 재전송·durable 결과 저장·Account 시간 구간 한도를 추가하지 않는다. 서버 동시 억제는 선택 사항이며 process-local이면 그 범위만 보장한다.

**Verification**

제어된 transport로 HTTP 200+`ok`, 다른 응답, 명시적 거절, timeout·reset·응답 유실, 수동 재시도의 발송 횟수와 payload를 확인한다. 로그 수집 경계·오류 응답·client build 경계에서 합성 credential/본문의 불필요한 노출을 확인한다. 실 credential을 fixture로 사용하지 않는다.

- [x] 2.1 서버 확인 대상의 최소 payload와 안전한 Slack 설정·표시·관측 경계를 제공한다. (허용된 payload와 HTTPS Slack webhook allow-list를 단위·통합 테스트)
- [x] 2.2 ACK·실패·확인 불가 및 자동 재전송 없는 새 수동 발송 시도를 구현하고 transport 실패 경로를 검증한다. (200+`ok`, explicit rejection, thrown transport failure, single-call assertions)
- [x] 2.3 서버 동시 억제를 사용한다면 실제 요청 수명·process 범위와 해제를 검증하고 분산 한도 보장으로 표현하지 않는다. (서버 동시 억제를 사용하지 않으며 durable/rate state를 추가하지 않음)
- [x] 2.4 Privacy·credential 경계와 목적지 Retry-After 처리가 Account 시간 구간 제한을 도입하지 않는지 확인한다. (payload privacy assertions, no credential/log copy, no Account window limit)

## 3. PROD-915 Web 신고 form과 접근성

**Authority / Provenance**

`docs/design/content-reporting.md`, `docs/design/feedback.md`, `docs/design/accessibility.md`, `docs/design/post-action-bar.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915).

**Deliverable**

Post·Profile 메뉴에서 Web 신고를 열고 작성·제출·결과 확인·안전한 닫기를 keyboard와 pointer로 수행한다.

**Guardrails**

반응형 dialog/sheet를 사용한다. dirty 확인·pending 입력/제출/닫기 차단·실패와 확인 불가 입력 유지·성공 초기화와 결과 유지·폐기 후 새 draft를 보존한다. API 결과 유실을 미전달로 단정하지 않는다.

**Verification**

메뉴 진입, 반응형 화면, 모든 form 상태, 중복 클릭, 입력 경계, dirty 취소/폐기, 재열기, focus trap/복귀/fallback, 배경 접근·스크롤과 결과 알림을 실행 검증한다.

- [x] 3.1 Post·Profile 신고 진입점과 대상·사유·설명 form을 공통 API에 연결한다. (공통 context/form/overlay와 Post·Profile action menu 연결)
- [ ] 3.2 모든 결과·수동 재시도·draft·지원 닫기 경계를 구현하고 중복 클릭과 API 응답 유실을 검증한다.
- [ ] 3.3 Web keyboard·focus·반응형·보조 기술의 실행 증거와 관련 자동화 회귀 검증을 남긴다.

## 4. PROD-915 Android·iOS 신고 form과 접근성

**Authority / Provenance**

`docs/design/content-reporting.md`, `docs/design/accessibility.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915), 2026-09-10 현재 화면 위 modal/sheet 선택.

**Deliverable**

Android·iOS 각각에서 대상 화면 위 신고 form으로 공통 제출 계약을 사용할 수 있다.

**Guardrails**

별도 신고 페이지로 전환하지 않는다. 지원하는 back·배경·버튼·gesture dismissal에 dirty/pending 경계를 적용한다. Web 또는 공유 source 검사만으로 Native 실행 검증을 대체하지 않는다.

**Verification**

각 runtime에서 touch·중복 탭·keyboard·스크롤·font scaling·TalkBack/VoiceOver·공용 Button 최소 크기를 확인한다. 실패/확인 불가/재시도/성공과 닫기·재열기 시 입력을 확인한다.

- [ ] 4.1 Android/iOS 메뉴와 현재 화면 위 modal/sheet를 공통 form·API 계약에 연결한다.
- [ ] 4.2 Android runtime에서 전체 form 상태·keyboard·back/dismissal·TalkBack·중복 탭을 실행 검증한다.
- [ ] 4.3 iOS runtime에서 전체 form 상태·keyboard·dismissal·VoiceOver·중복 탭을 실행 검증한다.

## 5. PROD-915 공통 authorization 통합·회귀

**Authority / Provenance**

`docs/domain/decisions/0030-content-report-submission.md`, `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/profile-block.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915), [PROD-822](https://linear.app/byulmaru/issue/PROD-822)의 공통 policy 결과.

**Deliverable**

실제 공통 직접 조회 결과를 신고 API가 우회 없이 소비하며 현재 저장 가능한 제한 상태를 누락하지 않는다.

**Guardrails**

이 그룹의 완료에는 방향별 공통 Post Block 결과가 필요하다. PROD-822 전체·특정 branch·Block UI·미래 capability 완료를 요구하지 않는다. PROD-915가 Block policy를 복제하지 않으며 relatedTo를 자동 blockedBy나 교차 기능 Git Stack으로 바꾸지 않는다.

**Verification**

local/remote Post·Profile, public/unlisted·FOLLOWERS·현재 저장 DIRECT의 기존 작성자 경로, 미선택/selected viewer, A→B·B→A·mutual Block·잔존 Follow, lifecycle·Instance 제한을 실제 DB와 API 결과로 검증한다. 조회 가능한 Profile 기본정보와 Post 콘텐츠 제한, Repost/Quote 자체·Source의 기존 직접 조회 정책을 구분한다.

- [ ] 5.1 최신 canonical·main·PROD-822 결과를 대조하고 공통 직접 조회 경계를 신고 API에 최종 연결한다.
- [ ] 5.2 방향별 Block·잔존 Follow·viewer·local/remote·lifecycle·Instance·현재 visibility 회귀를 실제 authorization 결과로 검증한다.
- [ ] 5.3 작성 후 대상 삭제/권한 상실과 수동 재시도 전 상태 변경에서 발송을 거절하는 통합 회귀를 확인한다.

## 6. PROD-915 최종 통합·완료·archive

**Authority / Provenance**

`docs/domain/decisions/0030-content-report-submission.md`, `docs/design/content-reporting.md`, `memory/issue-openspec-workflow.md`, [PROD-915](https://linear.app/byulmaru/issue/PROD-915).

**Deliverable**

PROD-915가 세 플랫폼에서 Slack까지 이어지는 전체 계약의 증거를 모으고 모든 범위 완료 후 이 change를 동기화·archive한다.

**Guardrails**

1~5의 구현·검증 완료 후 수행한다. 한 플랫폼·부분 PR 완료로 archive하지 않는다. PROD-907에 별도 검증을 넘기지 않는다. 후속 분산 제한 이슈 생성·완료, 운영자 처리나 durable 전달 보장을 추가하지 않는다. 현재 Spec 단계에서는 실제 Slack 메시지를 보내지 않는다.

**Verification**

세 플랫폼 실행 기록, 통제된 실패·확인 불가 증거, 승인된 테스트 대상/목적지의 Slack 수신 확인, 전체 requirement/scenario 대응, 변경 범위에 맞는 lint·typecheck·자동화 테스트와 strict validation을 확인한다. 실제 Slack 테스트 발송은 구현·검증 단계의 명시된 대상과 권한 범위에서 수행한다.

- [ ] 6.1 세 플랫폼과 공통 API·Slack의 종단 간 성공·실패·확인 불가·중복 억제 증거를 모은다.
- [ ] 6.2 최신 canonical·Linear·OpenSpec과 실제 구현·검증을 대조하고 배포·rollback 경계 및 남은 제한을 기록한다.
- [ ] 6.3 전체 task와 검증 완료 후 delta specs 동기화·archive·archive 후 validation을 수행하고 완료 승인 근거를 제출한다.
