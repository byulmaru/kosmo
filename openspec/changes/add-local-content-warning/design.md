## Context

Canonical PostContent V1 document는 `summary`를 nullable Plain Text Content Warning으로 이미 저장·검증하고,
GraphQL `PostContent.contentWarning`과 ActivityPub projection도 이 값을 읽는다. 그러나 Local `createPost` input과
일반·Reply Composer에는 write path가 없고, 공용 Post renderer는 Content Warning이 있어도 본문과 Media를 바로
표시한다.

PROD-460은 Local API 입력·저장·성공 회귀 검증을, PROD-642는 Composer와 공용 표시·reveal UI를 소유한다. 두
이슈는 같은 사용자 결과를 완성하고 동일한 Content Warning canonical contract를 공유하므로 이 change에서 함께
구현·검증한다.

## Goals / Non-Goals

**Goals:**

- optional nullable `contentWarning`을 기존 V1 document `summary` 저장 경로에 연결한다.
- 일반·Reply Composer가 같은 입력·합산 길이·제출 계약을 사용하게 한다.
- direct Parent Content Warning은 Reply draft 초기값으로 한 번만 복사한다.
- Content Warning Post의 본문과 Media를 기본 가림하고 canonical `Post.id` 기반 reveal 상태를 공용 surface에
  공유한다.
- selected Profile·session 전환, Sensitive Media와 replay block 경계를 안전하게 유지한다.

**Non-Goals:**

- `PostContentDocument` version, DB schema 또는 Content Warning 전용 모델을 변경하지 않는다.
- reveal preference를 서버에 저장·동기화하지 않는다.
- 원격 Content Warning ingestion·sanitization, Sensitive Media 정책, ActivityPub delivery를 재설계하지 않는다.
- Android·iOS 실제 기기 release gate를 Web 중심 PR 검증 완료로 대체하지 않는다.

## Implementation Guidance

### Current Constraints

- 서버 canonical builder는 `summary`를 이미 받을 수 있지만 Local resolver는 항상 `null`을 전달한다.
- Composer는 본문과 Media를 공용 state로 관리하므로 Content Warning을 Reply 전용 state나 mutation으로 만들면
  일반 Post와 Reply의 계약이 갈라진다.
- 같은 Post가 Home·Profile·Thread·Reply Parent preview에 동시에 나타날 수 있어 component-local reveal state는
  surface별 불일치를 만든다.
- selected Profile과 session은 권한·Relay environment lifecycle 경계이므로 reveal state를 process 전역으로
  유지하면 다른 actor 문맥으로 UI 상태가 전파될 수 있다.
- 본문과 Media가 서로 다른 renderer subtree에 있어 경고 본문만 숨기면 Media나 analytics replay에 보호 대상이
  남을 수 있다.

### Recommended Approach

1. GraphQL input에서 Content Warning을 optional nullable string으로 받고 공통 Plain Text normalization과 본문
   합산 길이 검증을 거쳐 기존 PostContent builder의 `summary`에 전달한다.
2. 공용 Composer state에 Content Warning을 추가해 일반 Post와 Reply가 같은 mutation payload와 성공·실패
   lifecycle을 사용하게 한다. Reply surface가 새 Parent 문맥으로 초기화될 때만 Parent 값을 초기 state로
   전달하고 이후에는 독립 draft로 둔다.
3. Reply close 보호는 Parent와 surface lifecycle을 소유한 controller가 담당하고 공용 Composer는 submitting
   상태만 전달해 pending close를 차단한다.
4. session/selected Profile boundary 안에 reveal store Provider를 두고 canonical `Post.id`로 상태를 조회·변경한다.
   lifecycle 전환 시 Provider instance를 교체한다.
5. 공용 Post Content root에서 경고, 본문과 Media를 하나의 replay 차단 경계로 감싸고 reveal 전에는 본문과
   Media subtree를 mount하지 않는다. Sensitive Media 공개 state는 기존 별도 경계를 유지한다.
6. API 성공 mutation의 저장값, Composer 입력·합산 검증, Reply Parent 초기화·close lifecycle, cross-surface
   reveal·re-hide와 replay block을 자동화로 검증한다.

### Allowed Alternatives

- reveal store는 Context, 외부 store 또는 동등한 adapter로 구현할 수 있다. 다만 공용 key와 lifecycle reset은
  specs의 canonical `Post.id`·selected Profile/session 계약을 그대로 지켜야 한다.
- API validation은 resolver input schema 또는 공유 validation 경계에 둘 수 있다. 저장 전 normalization과
  실패 시 원자성, 동일한 사용자-facing 오류가 검증되는 경우에만 허용한다.

### Known Traps

- Content Warning을 별도 Post field·DB column으로 저장해 canonical revision document와 분리하지 않는다.
- Parent 값을 render마다 Reply state에 동기화해 사용자의 수정·제거를 덮어쓰지 않는다.
- reveal key로 component instance, route, surface 또는 PostContent revision ID를 사용하지 않는다.
- Content Warning reveal을 Sensitive Media 공개와 결합하거나 reveal 전 Media만 mount하지 않는 부분 가림을
  만들지 않는다.
- `contentWarning`이 길이 합계에는 참여하더라도 Content Warning만으로 contentful Post를 만들 수 있게 하지
  않는다.

## Risks / Trade-offs

- [공용 reveal state가 actor lifecycle을 넘으면 다른 Profile에서 가림이 풀릴 수 있음] → selected Profile 또는
  session 전환 시 Provider store를 새로 생성하고 회귀 테스트로 고정한다.
- [경고 본문만 숨기면 Media·replay가 민감 내용을 노출할 수 있음] → canonical Post Content root 전체를 같은
  가림·replay 경계에 둔다.
- [API와 UI가 동시에 배포되지 않으면 구버전 client는 새 입력을 사용하지 못함] → input을 additive optional로
  유지해 기존 client 호출을 보존한다.
- [Web 자동화가 Native 실제 접근성을 증명하지 못함] → Android/iOS TalkBack·VoiceOver와 keyboard/touch 검증은
  Native release gate의 명시적 남은 증거로 유지한다.

## Migration Plan

1. optional GraphQL input과 기존 summary 저장 연결을 additive로 배포한다. DB migration은 없다.
2. 일반·Reply Composer 입력과 API payload를 배포한다.
3. 공용 renderer와 selected Profile·session reveal Provider를 배포한다.
4. 롤백 시 client 입력·reveal 연결을 먼저 제거해도 기존 `summary` 데이터와 원격 Post 조회는 유지된다. additive
   GraphQL input 제거는 compatibility 확인 없이 즉시 수행하지 않는다.

## Open Questions

없음.
