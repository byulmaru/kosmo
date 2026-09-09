# 2026-09-08 Quote 발신·승인 Domain Gate 검토

## 조사 시작 시점 상태 (2026-09-08)

[PROD-902](https://linear.app/byulmaru/issue/PROD-902)는 로컬 Quote 발신과 Source 작성자의 인용
허용·승인·철회 정책을 결정하고 canonical 문서와 후속 이슈를 정렬하는 도메인 결정 이슈다.
이 이슈의 본문은 OpenSpec 작성과 API·DB·Fedify·UI 구현을 제외한다.

이 문서는 조사 근거, 이번 대화에서 선택한 항목과 남은 질문을 기록한다. 현재 canonical 계약을 대체하거나
Domain Gate 승인을 나타내지 않는다. 정책의 적용 단위와 lifecycle까지 결정한 뒤
[Post](../objects/post.md), 관련 객체·디자인 문서와 ADR에 반영하고 전체 결과를 승인받는다.
후속 구현 이슈의 범위와 Issue Gate가 승인되면 해당 이슈가 필요한 OpenSpec을 작성한다.

- 조사일: 2026-09-08.
- Repository: `github.com/byulmaru/kosmo`.
- 기준 branch: `PROD-902`, base `main`.
- 기준 commit: `4417b2a8a1a11796ae41adc9921686e1a3e4fe25`.
- Domain Gate: 진행 중. 인용 허용 선택지와 기본값만 대화에서 선택했다.
- Issue Gate: 새 구현 이슈의 범위·소유권 승인 전.
- 조사 시작 시점 OpenSpec Gate: 미착수. 이 기록은 OpenSpec이나 구현 승인 자료를 대신하지 않는다.

## 독립 확인한 근거

### Linear

최신 본문, 관계와 전체 댓글을 OpenSpec과 독립적으로 확인했다. 아래 표는 조사 시작 시점의 snapshot이다.

| 이슈                                                   | 본문 수정 시각 UTC         | 현재 책임                                                                                    | 계약 변경 댓글                      |
| ------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| [PROD-902](https://linear.app/byulmaru/issue/PROD-902) | `2026-09-07T08:12:00.157Z` | 발신·허용·승인·철회 Domain Gate와 canonical·이슈 정렬                                        | 없음                                |
| [PROD-431](https://linear.app/byulmaru/issue/PROD-431) | `2026-09-07T08:12:30.488Z` | 로컬 Quote·Reply+Quote 작성 API·core·Composer, 자체 통합 검증                                | 없음                                |
| [PROD-792](https://linear.app/byulmaru/issue/PROD-792) | `2026-09-07T09:50:08.844Z` | 원격 Quote 수신·승인 검증·Source resolution·기존 카드 표시                                   | 없음. 댓글 1개는 계약 변경이 아니다 |
| [PROD-793](https://linear.app/byulmaru/issue/PROD-793) | `2026-09-07T09:50:15.955Z` | 미저장 Followers Only Source를 조회할 Local Follower 선택·signed fetch·저장 직전 권한 재검증 | 없음                                |

조사 시작 시 PROD-792는 제외 범위의 로컬 Quote 작성과 발신을 모두 PROD-431에 연결했지만, PROD-431은
Quote 전용 federation 발신을 명시적으로 제외했다. 이번 작업에서 PROD-792 본문을 정정해 작성은 PROD-431,
발신 정책은 PROD-902, 발신 구현은 Domain Gate 이후 지정할 후속 구현 이슈로 구분했다.
PROD-792의 수신 책임과 PROD-793의 signed fetch 책임, 기존 이슈 관계는 유지했다.

- PROD-902에는 D1 선택과 아직 결정하지 않은 항목, 참조 정정 결과를 기록했다. 최종 확인한 수정 시각은
  `2026-09-08T01:14:45.981Z`다.
- PROD-792의 참조 정정 결과를 `2026-09-08T01:13:43.623Z` snapshot으로 확인했다. 동시에 진행된
  PROD-793의 Source URI·expected author 검증 정보 전달 계약도 보존했다.
- PROD-793은 `2026-09-08T01:13:11.059Z` 본문과 전체 댓글을 다시 확인했다. 인증된 선행 처리에서 검증한
  Source URI와 작성자 대응이 있는 경우만 signed fetch를 수행하고, URI만으로 작성자를 추론하지 않는다.
  이 계약은 원격 Source의 수신·조회에 적용하며 로컬 Quote 발신 지원을 뜻하지 않는다.
- 위 PROD-793 계약의 canonical 설명은 `PROD-793` branch의 `docs/domain/objects/post.md`에서 직접
  확인했다. 현재 PROD-902의 main 기준에는 아직 없으므로 merge된 공용 기반으로 취급하지 않는다.

### Canonical 문서

- [Post](../objects/post.md): Quote와 Reply+Quote의 작성·관계·Visibility·Eligibility·Source 조회,
  ActivityPub Local Note 표현과 제외 범위.
- [ADR 0014](../decisions/0014-post-structure-relations.md): Content, Reply Parent와 Repost Source의
  독립 관계. Quote는 별도 Post Kind나 객체가 아니다.
- [ADR 0017](../decisions/0017-activitypub-local-post-note.md): Local Note identity·audience·역참조,
  Quote 전용 federation 표현의 후속 계약 경계.
- [Profile Block](../objects/profile-block.md): 양방향 조회·상호작용 차단과 현재 cleanup 범위.
- [Post Action Bar](../../design/post-action-bar.md): 기존 Repost 메뉴와 action target 계약.
- [워크플로](../../../memory/issue-openspec-workflow.md): Domain → Issue → OpenSpec 순서와 gate 전환 승인.

### 프로토콜 참고

[FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/)는 조회 시점에 Draft다. 자기 인용을 제외한 FEP
Quote에는 개별 `QuoteAuthorization` 검증이 필요하다. `interactionPolicy.canQuote` 광고만으로 승인을
대체하지 않는다. 요청은 `QuoteRequest`, 응답은 `Accept` 또는 `Reject`, 철회는 승인 객체의 `Delete`로
표현한다. 승인을 기다린 뒤 게시할지, 먼저 게시하고 갱신할지는 제품이 선택할 수 있다. 이 프로토콜은
원문 조회 권한을 추가로 부여하지 않는다.

[Fedify interaction controls](https://unstable.fedify.dev/manual/interaction-controls)는
`quoteInteraction`으로 요청·정책·승인 검증을 지원한다. 문서는 unstable 채널이며 현재 저장소 의존성은
Fedify/vocab `2.3.0`이다. 문서의 API를 현재 설치 버전에서 사용할 수 있다고 단정하지 않는다. 정책이 없는
대상을 허용한다고 추정하지 않으며, listener·저장·전달·제품 정책은 Kosmo가 소유한다. 의존성 추가나 버전
변경은 후속 구현 이슈에서 호환성을 검증한다.

외부 문서는 상호운용 제약과 대안의 근거다. Kosmo의 제품 기본값이나 출시 범위를 승인하는 근거는 아니다.

## 기존 계약에서 유지할 기준

1. Quote는 자체 Current Content와 direct Repost Source를 가진 Post다. Reply Parent는 독립적으로 함께
   존재할 수 있고 Source를 재귀적으로 평탄화하지 않는다.
2. 현재 로컬 Quote 작성 계약에서는 작성자가 Content가 있는 Source와 선택적 Parent를 각각 조회할 수
   있어야 한다. Quote Visibility는 두 대상의 Visibility와 독립적으로 선택한다.
3. Source가 Tombstone이 되거나 viewer에게 조회 불가능해도 Quote 자체 Content를 삭제하지 않는다.
   Quote 자체 Visibility·Eligibility를 통과하면 본문을 표시하고 Source 관계의 노출을 제한한다.
4. 승인 여부와 원문 조회 권한은 별개다. 승인된 인용도 viewer별 Source 조회 검사를 통과해야 한다.
5. 기존 원격 수신 계약은 FEP `quote`를 우선하고, 그 속성이 없을 때만 레거시 형식을 사용한다.
   잘못된 FEP Quote를 레거시로 강등해 승인 검증을 우회하지 않는다.
6. 일반 Note projection·materialization은 관련 공용 경계를 재사용한다. Quote의 허용·승인 상태나
   전용 lifecycle을 일반 Note 변환 책임으로 옮기지 않는다.

2번의 로컬 작성 권한과 새 인용 허용 정책이 만나는 조건은 아직 확정하지 않았다. 게시 전에 알려진 거절을
막을지, 허용 상태를 확인할 수 없는 경우 본문만 게시할지 결정한 뒤 PROD-431과 함께 정렬해야 한다.

## 이번 대화에서 선택한 항목

### D1. 인용 허용 선택지와 기본값

- 상태: 선택 완료. Domain Gate 전체 승인과는 별개다.
- 결정일: 2026-09-08.
- 근거: 현재 `PROD-902 Spec` 대화의 첫 번째 질문에 대한 사용자 응답.
- 선택: 모두·팔로워·본인만 자동 승인, 기본값은 모두.
- 첫 출시에서 건별 수동 승인 기능은 포함하지 않는다.
- 인용을 허용하더라도 기존 원문 조회 권한을 별도로 검사한다.
- 아직 결정하지 않은 내용: 설정 소유 객체와 적용 단위, 기존 Post의 초기값, 설정 변경이 이미 발급한
  승인에 미치는 영향. 이 선택만으로 위 항목을 확정하지 않는다.

## 답변을 기다리는 질문

| ID  | 결정할 내용                 | 제시한 권고안                                                             | 대안                                                 | 영향                                                        |
| --- | --------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Q2  | 원격 승인 대기·거절 중 게시 | 자체 본문은 즉시 게시·전달하고 Source 카드는 승인 뒤 표시                 | 승인될 때까지 글 전체 게시·전달 보류                 | PROD-431 작성 결과, 발신 Create/Update, Composer 복구       |
| Q3  | 첫 출시의 Source 공개 범위  | 외부 인용은 Public·Unlisted Source부터, Followers Only Source는 후속 분리 | Followers Only Source도 처음부터 양쪽 접근 권한 검증 | 발신과 승인 발급 범위, PROD-793 재사용 경계, 독립 출시 순서 |

Q2와 Q3는 아직 답변하지 않은 질문이다. 권고안을 채택한 것으로 간주하지 않는다. 특히 Q3에서 Followers
Only Source 발신을 보류하더라도 기존 로컬 Quote Visibility를 제한하거나 Quote 자체 본문의 외부 전달까지
자동으로 금지한다는 뜻은 아니다. 후속 질문에서 외부 표현과 작성자 안내의 구체적인 동작을 정한다.

## 다음 결정 항목

아래 항목은 구현 수단 선택이 아니라 관찰 가능한 동작을 바꾸므로 후속 질문과 Domain Gate 검토에 포함한다.

- 허용 설정의 소유: Post별 설정과 Profile의 새 Post 기본값을 모두 제공할지, 한 단위부터 제공할지.
  기존 Post에 적용할 초기값, 이미 발급한 승인의 유지 여부도 함께 정한다.
- 로컬 Source: 같은 서버 안에서도 같은 허용 정책을 적용할지, 자기 인용을 어떻게 처리할지,
  기존 로컬 Quote 작성 조건을 어디까지 바꿀지.
- 레거시 원격 Source: 인용 허용 정책이 없는 서버에 대해 Quote 발신을 지원할지, 지원한다면 어떤
  호환 표현과 한계를 제공할지. FEP 검증 실패를 레거시 성공으로 바꾸지는 않는다.
- 미승인·실패 상태: 작성자만 보는 pending·거절·재시도 안내, 응답 없는 요청의 처리와 명시적 거절 뒤
  자동 재요청 여부. 네트워크 실패를 승인으로 간주하지 않는다.
- Reply+Quote와 audience: 외부 인용을 지원하는 Quote 자체 Visibility, Source 작성자가 제한된 Quote를
  검토하기 위해 받는 정보, Parent와 Source의 독립 권한, 레거시 fallback에 담을 URI와 본문.
- 승인 철회: 원문 작성자의 건별 철회 조작, 철회 후 자체 Content·저장 관계·외부 표현, 오래된 승인 응답과
  중복 전달의 처리, 철회 해제 또는 재승인 제공 여부.
- Source 또는 Quote 삭제·차단·unfollow: 기존 승인도 철회할지, 관계를 숨기기만 할지,
  차단 해제 뒤 승인과 Source preview를 자동으로 되살릴지.
- 출시·기존 데이터: 이미 저장된 Quote의 처리, 기능 활성화 순서, 발신 중단 시 기존 승인·철회 처리 유지.
  실제 운영 Quote 데이터 유무는 조사하지 않았으며 존재 여부를 추정하지 않는다.

## 후속 이슈의 책임 초안

이 표는 검토용 분해안이다. 새 이슈를 생성하거나 의존성·범위 변경을 승인한 상태가 아니다. 정책 답변에
따라 독립 출시 가능성이 달라지면 이슈 수와 경계를 먼저 고친다.

| 소유 이슈 또는 후보                               | 전달 결과                                                          | 검증·완료 책임                                                                                                | 의존성                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| PROD-902                                          | 정책 질문 닫기, canonical·관련 이슈 본문 정렬, Domain Gate 승인    | 로컬·원격 Source, 승인·거절·철회·삭제·차단과 제외 범위의 정책 정합성                                          | 현재 이슈                                                        |
| PROD-431                                          | 기존 로컬 Quote·Reply+Quote 작성 API·core·Composer 연결            | 작성 권한, 원자성, 오류 복구와 cross-layer 통합, 자신의 change 완료·archive                                   | 새 허용 정책이 작성 조건을 바꾸면 Domain Gate 결과와 정렬        |
| 새 구현 후보: Kosmo 원문 인용 허용·승인 발급·철회 | 허용 설정, 원격 요청 검증·응답, 승인 역참조·건별 철회와 조작       | 거절·위조·조회 불가 원문·삭제·차단·중복 요청, 해당 change의 통합 검증·archive                                 | PROD-902의 승인된 정책; 로컬 작성 연결은 PROD-431과 조율         |
| 새 구현 후보: 로컬 Quote 외부 발신                | 원격 원문 승인 요청·결과 반영, 승인 상태에 맞는 Note 표현·delivery | 로컬·원격 Source, 자기 인용, Reply+Quote, pending·거절·실패·철회·오래된 응답, 해당 change의 통합 검증·archive | PROD-431 및 승인 발급·철회 결과 중 실제로 필요한 계약            |
| PROD-792                                          | 원격 Quote 수신·승인 검증·Source 연결·기존 카드 표시               | 기존 수신 시나리오와 보유한 resolution lifecycle                                                              | 현재 PROD-509 선행 관계 유지                                     |
| PROD-793                                          | 미저장 Followers Only Source의 자격 있는 signed fetch              | fetch 전후 identity·Follow·audience 검증과 Source resolution                                                  | 현재 PROD-792 선행 관계 유지; outbound 지원 완료로 간주하지 않음 |

두 새 구현 후보를 하나의 change로 묶을지는 양쪽을 함께 출시·검증해야 하는지에 따라 판단한다.
파일·계층 수만으로 분리하지 않는다. 공통 통합 검증이 남으면 결과를 실제 소유할 이슈에 명시적으로
배정하고, 마지막 이슈나 부모 이슈라는 이유로 archive 책임을 추정하지 않는다.

인용 알림은 [PROD-903](https://linear.app/byulmaru/issue/PROD-903), 역방향 인용 목록은
[PROD-904](https://linear.app/byulmaru/issue/PROD-904)의 별도 정책 범위로 유지한다. 첫 출시에서 미루기로
정한 기능은 이유와 후속 owner를 확정해야 PROD-902를 완료할 수 있다.

## 구현 조사에서 확인한 경계

- `packages/core/db/tables.ts`와 `packages/core/services/post-structure.ts`에는 Quote 형태를 저장할
  관계 조합이 있다. GraphQL Source 조회와 기존 Quote presentation도 있다.
- `apps/api/src/graphql/resolvers/post/mutation/create.ts`와 `CreatePostInput`에는 Source 입력이 없다.
  `repostPost`는 Content 없는 Repost를 만든다. 표시용 Quote fixture를 사용자용 작성 경로로 해석하지 않는다.
- `packages/fedify/src/local-post-note.ts`의 Note 표현에는 Quote Source와 승인 정보가 없다.
  `local-post-delivery.ts`의 Create/Delete 경로는 이를 사용한다. Local Quote의 승인 상태 갱신용
  Update delivery는 현재 확인되지 않았다.
- `packages/fedify/src/federation.ts`와 inbound Note 경로에는 QuoteRequest·승인 발급·철회 listener가 없다.
  새 기능은 기존 Note 처리, Post 저장과 조회 경계를 재사용하되 별도 책임을 연결해야 한다.
- API·저장 계약·migration·실행 테스트는 이번 단계에서 변경하지 않았다.

## 다음 전환 조건

1. 남은 정책을 결정하고 canonical 객체·정책·디자인 문서와 ADR을 정렬한다.
2. PROD-431/792/793의 포함·제외 범위를 정렬하고 Domain Gate 검토 목록을 승인받는다.
3. 필요한 후속 구현 이슈를 결과·의존성·검증·archive 책임으로 정리하고 Issue Gate를 승인받는다.
4. 승인된 구현 이슈를 입력으로 OpenSpec proposal·specs·design·decisions·tasks를 작성하고 윤문·계약 대조·
   strict validation을 수행한다. PROD-902의 이 기록만으로 해당 단계에 진입하지 않는다.

## 갱신된 이슈와 후속 결정 (2026-09-08)

앞선 기록은 당시 조사 상태를 보존한다. 이후 갱신된 PROD-902 본문과 Spec 대화에서 다음 결정을 추가로
확인했다. 현재 canonical 계약은 [ADR 0027](../decisions/0027-quote-consent-and-federation.md)과
[Post](../objects/post.md)를 따른다.

- 원격 manual approval은 지원한다. 자체 Content를 먼저 게시·전달하고, 승인 전 Source는 정상 인용으로
  노출하지 않는다. Accept와 유효한 승인 후 Source 연결·Update, Reject 후 자체 Content 유지·Source 비노출로
  수렴한다. Kosmo 자체의 건별 수동 승인 UI는 제외한다.
- 타인의 Source는 Public·Unlisted만 허용한다. 자기 Followers Only 인용은 원문 접근 범위를 넓히지 않는다.
- 원문 삭제와 명시적 승인 철회 후에도 자체 Content는 유지한다. 정책 변경은 이후 요청에만 적용한다.
- 사용자는 이번 사이클에 게시글별 설정만 제공하고 새 글은 `모두`로 시작하도록 선택했다. 기존 글도 `모두`로
  초기화하기로 답했다. 기존 승인에는 소급 적용하지 않는다.
- 사용자는 차단이 당사자 간 접근을 막되 기존 승인을 자동 철회하지 않도록 선택했다. 제3자에게도 Source를
  숨기려면 별도 승인 철회를 사용한다. 이 결정으로 차단 트리거에 관한 제품 질문을 닫았다.
- 사용자의 명시적 요청으로 [PROD-925](https://linear.app/byulmaru/issue/PROD-925)를 Backlog에 생성했다.
  Profile의 새 Post 인용 허용 기본값을 다루며, 기존 Post·승인을 소급 변경하거나 이번 사이클을 막지 않는다.

### 구현 책임과 검증

| 이슈     | 책임                                                                | 완료·검증 경계                                                                                  |
| -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PROD-902 | 도메인 정책과 canonical 정렬                                        | Domain Gate 승인. OpenSpec·제품 구현 제외                                                       |
| PROD-431 | 로컬 Quote 작성 API·core·Composer                                   | Source 조건, Reply+Quote, 작성·표시 통합 검증과 담당 change 완료                                |
| PROD-924 | 게시글별 정책, 로컬 Quote 발신, 원문 승인 발급·철회, 원격 승인 결과 | 작성부터 승인·거절·철회·삭제·차단까지 연합 통합 검증. 담당 change 전체 완료 증거와 archive 소유 |
| PROD-792 | 원격 Quote 수신·승인 검증·표시                                      | 기존 수신 계약·테스트 유지                                                                      |
| PROD-793 | 미저장 Followers Only Source signed fetch                           | 기존 인증된 source-author 근거 전달과 signed fetch 계약 유지                                    |
| PROD-925 | Profile의 새 Post 인용 허용 기본값                                  | 후속 Backlog. 현재 출시 의존성 없음                                                             |

PROD-924는 PROD-431의 로컬 작성 결과와 PROD-792의 수신 경계를 연결해 연합 흐름을 검증한다. 이 연결 책임에
기존 이슈의 재구현이나 다른 change를 조기에 archive할 권한은 포함하지 않는다. OpenSpec 분할·공유 여부와
출시 순서는 이 책임을 기준으로 Issue Gate에서 검토한다. 개별 제품 답변은 전체 Gate 승인을 대신하지 않는다.

### 공식 구현 조사 근거

- [Hackers’ Pub Quote inbox](https://github.com/hackers-pub/hackerspub/blob/e21745bf4657371156d8056328b5c44c3e77acdd/federation/inbox/quote.ts):
  QuoteRequest, Accept/Reject, 승인 삭제 처리와 Source 연결·해제 후 Update 경로를 확인했다.
- [Mastodon 명시적 철회](https://github.com/mastodon/mastodon/blob/3b6daf7ba7b49eb8b97557e6dc7877335cf5ab38/app/services/revoke_quote_service.rb)와
  [사용자 문서](https://docs.joinmastodon.org/user/quote-posts/)는 차단과 기존 인용 제거를 구분한다.
  일부 차단 파일에 직접 철회 호출이 없다는 사실만으로 전체 간접 호출 경로의 부재를 주장하지 않는다.
- [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/)를 정식 승인 경로로 사용한다. 구체적인 발신 레거시 필드와
  fallback, 저장 표현과 delivery·retry 순서는 PROD-924가 최신 공식 근거와 대조해 구현 명세에서 고정한다.

### 조사 시점 Gate

개별 제품 질문은 해결했다. canonical 문서와 이슈 책임 정렬 결과의 Domain Gate·Issue Gate 전체 승인은
아직 받지 않았다. PROD-902에는 OpenSpec을 생성하지 않았으며 구현도 하지 않았다. 승인 후 PROD-924의
구현 명세를 작성한다.

## 스펙 소유권 정정과 호환 표현 확정 (2026-09-08)

사용자는 현재 PROD-902 세션에서 902의 스펙을 작성하라고 명시했다. 이에 앞선 OpenSpec 제외·PROD-924로의
스펙 작성 이동은 정정한다. PROD-902가 `define-quote-consent-and-federation`을 소유하고 PROD-431·924가
담당 구현 task를 수행한다. PROD-924는 이 공유 change의 전체 task 완료·연합 통합 검증·spec 동기화 후
archive를 수행한다. 이 진행 지시를 제품 구현이나 최종 Spec Gate 승인으로 취급하지 않는다.

사용자는 승인된 인용에 `quoteUrl`, `quoteUri`, `_misskey_quote`와 인용 미지원 서버용 원문 링크를 제공하도록
선택했다. 승인 대기·거절·철회 상태에서는 자동 생성한 호환 속성·본문 fallback을 숨기고 직접 작성한 본문은
보존한다. 이 선택으로 발신 호환 표현의 제품 질문을 닫았다.

## 후속 상태와 원격 승인 판단 정정 (2026-09-09)

- PROD-902가 `define-quote-consent-and-federation` OpenSpec을 소유한다. PROD-431은 기본 Quote 작성,
  PROD-924는 게시글별 정책·발신·승인·철회와 전체 통합·archive를 맡는다.
- PROD-431의 2026-09-09 범위 정정에 따라 로컬 Reply+Quote 작성 UI·API와 링크 인용을 제외한다. 기존
  저장 관계·원격 수신·조회 표현은 유지한다.
- 자기 인용은 QuoteRequest 없이 허용한다. 타인의 원격 원문은 `interactionPolicy`의 automatic/manual 여부,
  정책 부재 또는 해석 실패와 관계없이 자체 Content를 pending 상태로 게시하고 QuoteRequest를 보낸다.
- `interactionPolicy`는 작성 전 UI·정책 힌트로만 사용한다. 실제 승인은 유효한 QuoteAuthorization으로
  확인하며, 승인 전 Source 관계와 자동 생성 FEP·레거시 표현·본문 fallback은 정상 인용으로 노출하지 않는다.
- 위 정정을 반영한 OpenSpec은 strict validation을 통과했고, 사용자가 2026-09-09 수정본의 Spec Gate를
  승인했다. 제품 구현 완료나 change archive 승인은 아니다.
