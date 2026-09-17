## Context

기준 코드는 `main`의 `8f48d6a628d14929be5476bfbcaa9ad3dcaca5b9`다. 전용 `PROD-926` worktree에서 조사했으며 제품 결정은 PROD-903과 2026-09-16 승인된 PROD-926 Issue Gate를 따른다.

기존 저장소는 Notification을 원인 객체의 projection으로 만들고, API와 cleanup이 core의 source availability 판정을 공유한다. Quote에는 생성 이후의 visibility뿐 아니라 최초 판단을 영구 보존하는 경계가 필요하다. upstream 승인·Mention·공통 정책 결과의 준비 여부는 최종 통합 검증 상태로 관리한다.

## Goals / Non-Goals

**Goals:**

- 승인된 Quote의 최초 알림 판단, 교차 Type 단일 결과, API·읽음·정리를 같은 서버 계약으로 연결한다.
- 최초 정책 억제와 retry 가능한 저장 실패, 승인 대기, 물리 삭제를 구분한다.
- 다섯 기술적 질문을 구현자가 실행·검증할 수 있는 계약으로 구체화한다.

**Non-Goals:**

- Word/Hashtag/Post Notification Mute의 기반 구현·Quote 연결, PROD-953 UI·상세 이동·클라이언트 통합, Local Mention·FCM·Local Reply+Quote 작성.
- 승인·철회 프로토콜의 재구현, 새 Post 구조, 전체 Notification grouping 변경, 새로운 outbox·정기 backfill 체계.
- upstream 결과 미준비를 fixture로 숨기거나 이 change에서 upstream 전체 완료·archive를 소유하는 것.

## Implementation Guidance

이 절은 권장 접근을 설명한다. 반드시 지켜야 할 계약은 spec과 `decisions.md`의 Active 결정에 있으며 테이블·함수 이름은 고정하지 않는다.

### Current Constraints

| 현재 경계                                                                     | 조사 결과와 설계 영향                                                                                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/db/tables.ts`의 `Notifications`                                | `(recipientProfileId, kind, sourceId)` unique는 Type 간 중복과 물리 삭제 후 재생성을 막지 못한다. `data`는 빈 객체이며 이름·본문 snapshot 저장소가 아니다.  |
| `packages/core/enums.ts`, `packages/core/db/enums.ts`                         | 현재 다섯 kind만 존재한다. Quote 추가는 DB·서버 Type routing·SDL을 함께 반영해야 한다.                                                                      |
| `packages/core/services/notification.ts`, `create-reply-notification.ts`      | source별 직접 저장 경계가 나뉘어 있다. Quote 함수 하나에서 기존 Reply/Mention을 조회하는 것만으로 동시성을 해결할 수 없다.                                  |
| `packages/core/visibility/notification.ts`                                    | API와 cleanup이 공유한다. Quote·direct Source·승인 결과를 여기에 일관되게 연결하되 Recipient 자체 가용성의 cleanup 예외를 유지한다.                         |
| `apps/api/src/graphql/resolvers/notification/ref.ts`와 `access/visibility.ts` | concrete typename routing과 membership·source filtering이 분리되어 있다. Quote를 Repost loader fallback으로 처리하면 원인 Post와 Source를 혼동한다.         |
| `field/profile.ts`, `mutation/mark-read.ts`                                   | SQL filtering 후 ID cursor pagination, visible unread count, `coalesce(readAt, now())` 지정 읽음이 있다. 새 endpoint 없이 Quote를 연결한다.                 |
| `apps/worker/src/activities/cleanup-unavailable-notifications.ts`             | 100개 bounded batch와 삭제 직전 availability 재확인을 사용한다. 같은 실행 경계에 Quote를 추가한다. Schedule·batch 크기·SLA는 변경하지 않는다.               |
| upstream                                                                      | main에는 PROD-327 공통 정책의 최종 통합 결과가 없으며 792/924/911도 완료 증거가 없다. 최신 계약을 입력으로 설계하되 실제 adapter 연결·검증은 task에 남긴다. |

### Recommended Approach

#### 1. 최초 판단과 대표 알림 선택을 별도 저장

Quote가 원인인 Post에 한해 `(quotePostId, recipientProfileId)`별로 조정 기록을 두는 방식이 현재 구조에 맞는다. 여기서 `quotePostId`는 원인 Quote 자체의 Post ID이며 direct Repost Source ID가 아니다. 기존 Notification의 `sourceId`도 이 Quote identity에 대응한다. 기존 Notification unique는 유지한다. 조정 기록에는 대표 kind·대표 Notification identity와 Quote의 최종 판정 사유·시점을 보존한다. Notification을 참조하더라도 삭제 cascade로 조정 기록이 사라지지 않도록 한다. 본문·Profile 이름·Source 객체 snapshot은 복제하지 않는다.

개념상 Quote 상태는 `awaiting-approval`과 최종 `emitted`, `suppressed`, `represented-by-existing`, `excluded-prelaunch`로 구분한다. 이는 공개 enum이나 DB shape의 확정이 아니다. 아직 미승인인 상태와 일시적인 DB 실패를 최종 억제로 저장하지 않는 것이 핵심이다. 기존 Reply/Mention 대표 선택은 Quote가 승인 대기인 동안에도 저장할 수 있다.

DB의 unique key와 transaction 잠금으로 최초 row 확보부터 대표 선택·Notification insert·최종 판단 확정까지 원자적으로 처리한다. `INSERT ... ON CONFLICT`로 빈 조정 row를 확보한 뒤 해당 row를 잠그고, 기존 대표나 기존 Notification을 확인하고, 현재 commit된 후보를 모두 평가한 후 하나의 결과를 commit하는 경로를 권장한다. 여러 Recipient를 처리하면 잠금 순서를 고정해 deadlock을 줄인다.

Notification 삭제 이후에도 대표 선택과 Quote 판단은 남는다. Source의 soft delete·Tombstone이나 재승인으로 기록을 지우지 않는다. 같은 원인 identity를 재수신했을 때 새로운 내부 source로 재발급해 우회하지 않고 upstream의 canonical Post identity를 사용한다. 전체 Post/Recipient의 영구 삭제 정책이나 별도 retention 사업은 이 change에서 만들지 않는다.

#### 2. 승인 결과 소비와 실패 경계

792/924가 제공하는 신뢰할 수 있는 저장 결과에서 Quote ID, direct Source ID, 현재 유효 승인 및 Source 표시 가능 여부를 읽는다. effect input의 ID는 조회 키이며 클라이언트나 원격 payload가 전달한 `approved: true`를 권위로 사용하지 않는다. stale 승인 이벤트가 최신 철회 상태를 덮지 않도록 현재 승인 version/state를 확인한다. 검증·서명·QuoteAuthorization 역참조는 upstream 소유다.

Local 작성과 Remote 수신의 post-commit effect에서 동일한 core 판단 경계를 호출한다. Source가 commit되지 않았으면 효과를 실행하지 않는다. Notification 저장 오류는 원본 Post·승인 결과를 되돌리지 않고 기존 Activity retry와 관측 경계에 전달한다. Workflow ID만으로 영구 멱등성을 대신하지 않는다.

정책 경계가 명시적 deny 또는 fail-closed 억제 결과를 반환하면 이번 생성은 억제한다. 그 결과를 저장할 수 있으면 최초 억제로 확정한다. DB 장애로 transaction 자체가 실패했으면 최종 판단을 확정했다고 간주하지 않고 전체 Notification 판단을 재시도한다. 승인 대기·일시적 전송 실패는 승인 근거가 아니며 최초 승인 판단과 구분한다.

| 실행 결과                                   | 판단·알림 저장                                           | 재처리와 관측 증거                                                         |
| ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| 승인 대기·승인 응답 미확인                  | Quote 최종 판단·알림 없음. 기존 R/M 대표는 보존          | upstream의 실제 첫 승인 후 판단. 승인 상태와 effect identity 확인          |
| stale 승인 응답, 현재 철회                  | Quote를 만들지 않고 현재 철회 상태를 유지                | 최신 승인 version/state 대조. 이미 확정된 판단은 변경하지 않음             |
| 명시 deny 또는 공통 정책의 fail-closed 반환 | DB transaction이 성공하면 억제를 최종 기록하고 알림 없음 | 이후 같은 Quote retry는 no-op. 이유 분류와 Quote·Recipient identity를 관측 |
| 정책 DB 오류 등으로 transaction이 abort됨   | 새 최종 판단·알림 없음                                   | 원본 Post commit 유지, 기존 Activity retry·오류 관측                       |
| Notification insert 또는 판단 저장 실패     | 같은 transaction의 두 결과 모두 rollback                 | 판단만 남은 부분 결과가 없는지 확인하고 재시도                             |
| commit 뒤 응답 유실                         | 확정된 판단·알림 유지                                    | 재시도가 기존 결과로 수렴하며 ID·readAt 불변                               |

관측은 기존 structured log·Activity 결과를 사용한다. 새로운 metrics 시스템을 만들거나 민감한 본문·Mute 내용을 로그에 복제하지 않는다.

#### 3. Reply → Quote → Mention 조정

Quote 관계가 있는 Post의 Reply/Quote/Mention 저장 경로를 공통 조정 경계로 연결한다. 각 Type은 자신의 원인·Recipient·조회 조건과 현재 범위의 공통 Profile Mute·Block을 먼저 평가한다. 공통 정책 실패는 allow로 바꾸거나 낮은 Type으로 우회하지 않는다. 제외한 세 Mute를 검사하기 위한 기반·callback은 추가하지 않는다.

조정 대상에는 upstream이 저장한 승인 대기 인용 관계도 포함한다. 승인 전에는 Source FK가 아직 연결되지 않을 수 있으므로 FK 존재만으로 대상을 고르지 않는다. pending Quote에서 먼저 만든 Reply/Mention도 대표 기록을 남겨, 해당 알림이 cleanup된 뒤 최초 승인이 도착해도 새 Quote 알림으로 대체되지 않게 한다. pending 관계를 식별하는 실제 저장 결과는 792/924의 경계에서 소비한다.

잠금 아래 같은 판정 snapshot에 있는 유효 후보를 모아 우선순위를 적용한다. 작업 큐에서 먼저 실행된 Activity의 Type을 승자로 삼지 않는다. 이미 저장된 대표 Reply/Mention이 있으면 현재 visible 여부와 무관하게 그 선택을 먼저 보존한다. 승인 대기 시 생성된 Mention은 이후 Quote 승인으로 교체하지 않는다. 조정 row가 없는 기존 알림은 잠금 아래 읽어 대표 기록을 연결하되 기존 행·읽음 시각을 갱신하지 않는다.

판정 시점은 공통 잠금을 획득한 뒤 원인·승인·Mention 관계와 정책을 읽는 일관된 DB snapshot이다. 이 snapshot 전에 commit된 유효 후보는 호출 Activity의 Type과 무관하게 함께 고려한다. snapshot 뒤에 승인됐고 그 전에 Mention이 대표로 commit됐다면 늦은 승인 규칙을 적용한다. 여러 query를 사용할 때도 서로 다른 snapshot의 후보를 임의로 합치지 않고 동등한 일관성을 증명한다.

조정 기록 없이 기존 Reply와 Mention 등이 여러 개 남은 비정상 입력에서는 새 Quote를 억제하고 기존 행·Type·Read State를 모두 보존한다. 임의 한 행을 삭제·승격해 정합성을 복구하지 않는다. 기존 알림이 있다는 판단과 불일치를 기록해 추가 생성을 막고, 그 입력을 정상 단일 결과의 완료 증거로 사용하지 않는다. prelaunch Quote는 비소급 제외이므로 과거 중복 데이터 전체를 정리하는 작업을 이 change에 추가하지 않는다.

활성화 뒤 Quote Post를 처리하는 모든 R/Q/M writer가 이 경계를 사용해야 한다. Quote writer만 잠그고 Reply/Mention은 직접 insert하도록 남기면 경합을 막지 못한다. 비Quote Post와 Followee Post의 기존 lifecycle을 재설계하지 않는다. upstream에서 Mention source·recipient를 계산하고 검증하는 책임은 PROD-911이 유지한다.

#### 4. API와 cleanup의 동일한 판정

core에 Quote의 현재 승인·원인 구조·direct Source Recipient 일치·Related Profile·두 Post의 Recipient 기준 visibility를 표현한다. Notification pair Block은 양방향이고 직접 Post 조회의 방향별 Block 정책과 구분한다. Profile Mute는 생성 때만 적용하며 이미 생성된 알림의 availability에는 추가하지 않는다.

connection·count·Node·read mutation·cleanup은 동일한 원인 판정에 연결한다. API는 Recipient availability와 Account membership을 추가하고 cleanup은 Recipient 자체 비활성화만으로 삭제하지 않는다. Quote가 Source Author의 Profile로 보인다는 이유로 요청 Account에게 두 Post의 접근 권한을 새로 부여하지 않는다.

`QuoteNotification`은 공통 필드와 `post: Post!`, `profile: Profile!`만 추가한다. `post`는 Quote 자체이며 기존 Post 관계가 Source를 제공한다. 알림 원인 field와 최초 visibility가 서로 다른 snapshot을 사용해 숨겨진 Source를 다시 로드하지 않도록 기존 snapshot projection 또는 동등한 재검증을 사용한다. 읽음 mutation의 입력·payload와 cursor 형식은 유지한다. UI projection·표시 구성은 PROD-953 소유다.

### Allowed Alternatives

- 하나의 조정 table 대신 Quote 최초 판단과 대표 선택을 별도 table로 나눠도 된다. 두 결과가 같은 transaction으로 원자화되고 물리 삭제와 독립적으로 남아야 한다.
- row lock 대신 DB advisory lock·serializable transaction을 사용할 수 있다. 모든 대상 writer가 같은 key와 경계를 사용하고, unique 제약·재시도로 단일 commit을 증명해야 한다.
- 기존 승인 저장소가 필요한 최초 판단 기록을 안전하게 수용하면 그 저장소를 확장할 수 있다. 승인 재발급·삭제와 함께 알림 판단을 초기화하면 안 된다.
- upstream 함수 이름·Activity 위치는 실제 구현을 소비할 때 결정한다. approval 검증이나 Mention 생성 자체를 이 change로 복제하는 대안은 허용하지 않는다.

### Known Traps

- per-kind unique, `SELECT` 후 독립 insert, Temporal 완료 이력만으로 영구 중복을 막았다고 판단하는 것.
- 승인 대기나 transaction 실패를 최종 억제로 저장하거나, 삭제된 Notification이 없다는 이유로 재생성하는 것.
- Quote가 hidden이면 Source도 hidden이라고 가정하거나, Source가 hidden이어도 Quote가 보인다는 이유로 알림을 노출하는 것.
- shared main에 아직 없는 upstream 구현을 완료됐다고 기록하거나 fixture를 실제 lifecycle 검증으로 표시하는 것.
- 세 Mute의 장기 canonical 문구를 이 change의 미완료 task로 다시 끌어오는 것.
- 공개 GraphQL Type 추가를 old reader/writer와 자동 호환된다고 보는 것.

## Risks / Trade-offs

- [영구 판단 기록 증가] → source·recipient identity와 최소 결과만 보존한다. 임의 TTL을 적용하면 재생성 금지가 깨지므로 이번 cleanup 대상에 넣지 않는다.
- [교차 Type writer 일부만 전환] → 활성화 전에 모든 Quote 관련 R/Q/M 경로와 concurrent retry를 실제 DB로 검증한다.
- [가용성 변경과 생성 경합] → 저장 시 현재 승인·정책을 확인하고 API·삭제 경계에서 다시 판정한다. mutable 정책을 영구 snapshot으로 공개하지 않는다.
- [main의 Profile Mute 문서와 선행 변경의 시점 차이] → PROD-327의 최신 승인된 NULL·미래 만료 계약을 소비한다. 해당 canonical 정정은 `33a698a745b4a5bf6ab2baaadd0011c55bb9a3dd`의 `docs/domain/objects/profile-mute.md`에서도 독립 확인했다. upstream 통합 시 canonical이 정렬됐는지도 대조하며 기간 설정·정리는 추가하지 않는다.
- [미준비 upstream] → 저장·API의 독립 검증은 먼저 가능하다. 실제 792/924/911/327 통합 증거는 별도 미완료로 남긴다.
- [구버전 rollback] → Quote-aware한 reader·writer를 유지할 수 있는 rollback 기준 버전을 배포 검증에 명시한다. 호환되지 않는 예전 바이너리로 무조건 되돌리지 않는다.

## Migration Plan

1. **Additive storage:** Quote enum 값과 독립 판단 저장·unique/index를 추가한다. 기존 Notification 열·per-kind unique·row의 의미는 유지한다. DDL lock·transaction·runner 호환을 검증하며 contract/drop SQL은 포함하지 않는다.
2. **호환 코드 준비:** Quote를 읽고 숨기고 정리할 수 있는 API/Worker와 모든 관련 R/Q/M writer를 먼저 배포할 수 있게 한다. 생성 활성화는 별도 내부 스위치로 분리한다. 이 스위치는 사용자 preference가 아니다. 실제 upstream 결과가 미준비면 생성 활성화·최종 통합 완료를 선언하지 않는다.
3. **도입 기준 고정:** 환경별 최초 활성화 시각 `T0`를 DB 기준으로 한 번 기록하고 재시작·재배포·rollback으로 이동시키지 않는다. 서버가 저장한 immutable Post 생성 시각이 `T0` 전인 Quote는 기존 자료로 제외한다. remote `published`나 이벤트 도착 시각을 사용하지 않는다. 경계 시점에는 이전 writer·진행 중 source transaction을 drain하고 검증해 timestamp와 commit 순서의 틈을 없앤다. cutoff 저장 구조·이름은 구현에서 정한다.
4. **최초 승인 판단:** `T0` 이후 생성·materialize된 적용 대상 Quote는 승인 대기 중 판단을 소진하지 않고 첫 유효 승인 후 판정한다. `T0` 이전 Quote는 나중에 처음 승인돼도 제외한다. 기존 Quote에 Notification을 만드는 backfill은 없다. 기존 Reply/Mention 대표 기록을 연결하는 작업은 새로운 알림을 만들지 않는 보존 작업이다.
5. **검증 후 활성화:** 실제 upstream lifecycle, 공통 정책, API, cleanup, 동시 writer와 old/new 호환을 확인한다. PROD-953 UI 완료는 이 서버 gate에 추가하지 않는다. 이 순서는 배포 계획이며 이번 Spec 작성에서 실행하지 않는다.
6. **Rollback:** 신규 Quote 생성 진입을 비활성화하고 관련 in-flight effect를 drain한다. 이미 생성된 Quote를 현재 권한대로 처리하는 reader·read·cleanup과 R/Q/M 중복 방지 writer는 유지한다. 판단 기록·T0·enum·기존 알림을 drop하지 않는다. 재개 시 같은 T0와 기존 확정 결과를 재사용하고 과거 Quote 전체 scan이나 backlog backfill을 실행하지 않는다. 실제 저장 실패로 미확정인 accepted effect의 retry는 기존 경계로 처리한다. pre-Quote 바이너리 전체 복귀는 이 계획의 안전한 rollback 경로가 아니며, 별도 호환 증거 없이 실행하지 않는다.

배포 검증 기록에는 다음 결과를 남긴다. 이 기록은 구현·검증 task이며 이번 문서 작성의 실행 결과가 아니다.

- T0와 Post 시각을 같은 DB 시각 타입·저장 정밀도로 비교한 결과. timezone 표시나 애플리케이션의 millisecond 변환으로 cutoff를 반올림하지 않는다.
- T0 이전에 시작해 이후 commit하려는 transaction을 실제로 보류·drain한 결과, 경계 이전·동일·이후 row의 포함 여부, 오래된 Remote published와 새로운 local materialization의 구분.
- 환경·DB migration revision·API/Worker image revision·생성 활성화 상태, 대상 writer 및 in-flight 작업 drain 결과, restart 뒤 T0·판단·대표 선택의 불변 값.
- 최초 활성화 전에는 old/new가 섞여도 Quote 생성이 꺼져 있음을 확인한다. 활성화 뒤에는 Quote를 해석하지 못하거나 조정 경계를 우회하는 old reader/writer를 다시 투입하지 않는다.
- drain 실패나 버전 확인 실패 시 생성 활성화·호환되지 않는 downgrade를 진행하지 않는다. 기존 Quote-aware 코드와 저장 기록을 유지하고 미완료 원인을 기록한다.

## Open Questions

제품·범위·소유권 미결정 및 OpenSpec 작성 blocker는 없다. Spec Gate는 2026-09-16 승인됐으며, 이후 별도 구현·리뷰 요청에 따라 구현을 진행했다. 이 승인은 아래 실제 upstream 통합이나 배포 실행의 완료 증거가 아니다.

upstream adapter의 실제 이름·경로와 최종 통합 실행 가능 시점은 구현 증거로 확인할 항목이다. PROD-792의 compatibility harness 재검증, PROD-924 승인·철회, PROD-911 inbound Mention, PROD-327 공통 정책 연결은 실제 결과가 준비될 때 완료 처리한다. 이 상태를 추가 제품 선택이나 Spec 작성 blocker로 바꾸지 않는다.
