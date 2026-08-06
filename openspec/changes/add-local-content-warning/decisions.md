## Context

이 기록은 Local Content Warning API·Composer·공용 표시 계약을 소유한 PROD-460·PROD-642, canonical PostContent
문서와 Reply Composer 디자인을 반영한다. 저장 모델, Reply draft 초기화, reveal identity와 actor lifecycle을 여러
API·UI slice가 같은 방식으로 적용하기 위해 필요한 durable choice만 기록한다.

## Decision Records

### Content Warning은 기존 PostContent document summary에 저장한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-460`, `PROD-642`
- Status: Active
- Context / Problem: Local 작성 입력을 추가하면서 Content Warning을 별도 Post field나 DB column으로 만들면 같은
  revision의 authored content가 canonical document와 분리되고 기존 원격·GraphQL projection과 다른 source of
  truth가 생긴다.
- Decision Outcome: optional nullable `CreatePostInput.contentWarning`을 Plain Text normalize하고 기존
  `PostContentDocumentV1.summary`에 저장한다. `PostContent.contentWarning`은 이 summary projection을 계속 사용한다.
- Alternatives Considered: 별도 Post/Content column은 revision 원자성과 기존 document contract를 깨뜨려 제외했다.
  새 document version은 저장 shape 변경이 필요하지 않아 제외했다.
- Consequences: DB migration 없이 additive API로 배포할 수 있고 Local·Remote Content Warning이 같은 조회·표시
  경계를 사용한다.
- Confirmation / Follow-up: 성공 GraphQL mutation에서 저장된 `PostContents.document.summary`를 검증하고 null,
  normalization과 합산 길이 실패 회귀를 확인한다.

### Parent Content Warning은 Reply draft 초기값으로 한 번만 복사한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/reply-composer.md`, `PROD-642`
- Status: Active
- Context / Problem: Parent의 경고 문구를 Reply 작성에 활용하면서 render마다 동기화하면 사용자가 수정하거나
  제거한 독립 Reply draft가 Parent 값으로 되돌아간다.
- Decision Outcome: 새 direct Parent 문맥의 Composer가 초기화될 때 Parent `contentWarning`을 한 번 복사하고,
  이후에는 독립 state로 관리한다. Reply surface를 여는 Parent 문맥 자체가 폐기 확인 대상이며 close lifecycle은
  surface/controller가 소유하고 공용 Composer는 submitting 상태만 전달한다.
- Alternatives Considered: Parent와 양방향 또는 지속 동기화하는 방식은 사용자 편집을 덮어써 제외했다. 입력별
  dirty 계산을 공용 Composer에 남기는 방식은 Reply가 열린 동안 항상 보호되는 surface 계약과 중복돼 제외했다.
- Consequences: Parent를 바꾸면 새 초기값으로 시작하고 이전 draft는 전파되지 않는다. 일반 Post Composer는
  Reply close 정책을 알 필요가 없다.
- Confirmation / Follow-up: Parent 경고 유무, 수정·제거, Parent 전환, Reply-open close 확인, pending close 차단과
  일반 Post pristine 회귀를 검증한다.

### reveal 상태는 selected Profile·session 안에서 canonical Post identity로 공유한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/design/reply-composer.md`, `PROD-642`
- Status: Active
- Context / Problem: 같은 Post가 여러 surface와 component instance에 표시되므로 local state는 서로 다른 reveal
  결과를 만들고, process 전역 state는 actor lifecycle을 넘어 상태를 전파할 수 있다.
- Decision Outcome: 하나의 selected Profile·session lifecycle 안에서는 canonical `Post.id`만 reveal key로
  사용한다. surface 이동·remount에서도 상태를 유지하고 selected Profile 또는 session 전환 시 새 store로
  교체한다. reveal state는 서버나 PostContent revision에 저장하지 않는다.
- Alternatives Considered: component·route·surface별 state는 cross-surface 일관성을 깨뜨려 제외했다.
  PostContent revision ID는 하나의 Post identity 계약과 다르고 server preference는 승인된 저장 범위를 넘어 제외했다.
- Consequences: 같은 actor lifecycle의 Home·Profile·Thread·Parent preview가 reveal/re-hide를 공유하고 다른
  Profile·session은 항상 가림 상태에서 시작한다. Sensitive Media 공개는 별도 상태를 유지한다.
- Confirmation / Follow-up: same-Post 공유, remount 유지, different-Post 격리, selected Profile·session reset과
  Sensitive Media 독립성을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
