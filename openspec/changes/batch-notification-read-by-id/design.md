## Context

현재 `markNotificationRead` resolver는 concrete Notification global ID 하나를 kind로 해석하고, `visibleNotificationWhere`로 Account-Profile membership과 source visibility를 확인한 뒤 `readAt = coalesce(readAt, now())`로 최초 Read 시각을 보존한다. payload는 단일 `notification`과 `recipientProfile`을 반환하고, 앱의 item activation·Relay artifact·Storybook·단위 테스트·Web E2E·API 통합 테스트가 이 shape를 사용한다.

PROD-703은 이 기존 mutation을 지정 ID 배열 계약으로 교체한다. PROD-679의 Web `모두 읽음`은 서버 전체 unread 집합을 선택하지 않고 클릭 시점에 현재 Relay connection에 로드된 unread ID만 전달한다. 서버 slice와 Web slice는 하나의 `notification` capability를 공유하지만, PROD-679가 최종 통합·정합성 확인·archive를 소유한다.

## Goals / Non-Goals

**Goals:**

- 기존 membership·visibility·concrete Notification type 검증을 배열의 각 ID에 동일하게 적용한다.
- visible 입력을 원자적이고 멱등적으로 Read 처리하고 최초 `readAt`을 보존한다.
- 실제 처리 대상 Notification과 영향받은 Profile을 Relay가 정규화할 수 있는 배열 payload로 반환한다.
- 기존 단건 activation을 `{ ids: [id] }`로 호환 갱신한다.
- Web action은 current connection의 loaded unread만 한 요청으로 처리하고 서버 count로 수렴한다.

**Non-Goals:**

- 별도 전체 Read mutation 또는 기존 scalar input compatibility path 추가
- 서버가 전체 visible unread를 자동 선택하거나 Web이 추가 page를 선행 fetch하는 동작
- DB schema·migration·저장 counter·새 dependency·Fedify 변경
- Android/iOS `모두 읽음` UI 또는 PROD-682 pull-to-refresh 연결
- Notification 생성·전달·삭제·비동기 cleanup 정책 변경

## Implementation Guidance

### Current Constraints

- global ID의 concrete typename은 Notification kind와 함께 검증돼야 한다. UUID만 `IN` 조건에 넣으면 다른 typename으로 포장한 ID가 실제 row kind와 일치하지 않아도 처리될 수 있다.
- `visibleNotificationWhere`는 목록·count·Node·Read가 공유하는 membership과 kind별 source visibility 경계다. 배열 resolver가 더 단순한 recipient 조건을 별도로 만들면 hidden item과 count가 분기된다.
- Follow Request Notification payload는 source join 정보가 필요해 기존 단건 resolver가 update 전에 visible row를 별도로 읽는다. 단순 `UPDATE ... RETURNING notification.*`만으로 모든 concrete payload를 안전하게 구성할 수 있다고 가정하면 안 된다.
- 이미 Read인 visible 입력도 성공한 멱등적 payload에 포함돼야 한다. update 조건을 `readAt IS NULL`로 제한하면 반복 호출의 payload 수렴 계약을 잃는다.
- `unreadNotificationCount`는 저장 counter가 아니라 payload의 Profile field resolver가 같은 visible predicate로 계산한다.
- GraphQL schema 변경은 기존 앱 operation, 생성 Relay artifact, fixture와 직접 GraphQL을 호출하는 테스트를 같은 변경에서 정렬해야 한다.

### Recommended Approach

1. 입력 global ID를 concrete Notification typename별로 해석하고 중복 `(kind, UUID)`를 제거한다. Notification이 아닌 typename은 처리 후보에서 제외한다.
2. 실제 row match는 kind별 ID 집합과 `visibleNotificationWhere({ ctx })`를 함께 적용한다. 단순 UUID-only match나 client-provided Profile 범위는 사용하지 않는다.
3. 짧은 database transaction 안에서 visible 후보 전체를 `readAt = coalesce(readAt, now())`로 갱신한다. 정상 DML이 획득하는 row lock 외의 명시적 pessimistic lock은 추가하지 않는다.
4. update 결과의 ID/kind로 기존 Notification row selection과 필요한 source join을 다시 사용해 concrete payload row를 구성한다. payload hydration이 실패하면 transaction을 rollback한다.
5. 반환 row의 `recipientProfileId`를 중복 제거해 `recipientProfiles`를 구성한다. Profile field resolver가 처리 후 visible `unreadNotificationCount`를 계산하도록 하며 client-side count 산술을 만들지 않는다.
6. 기존 item activation operation은 같은 `markNotificationRead` field에 `[id]`를 전달하고 배열 payload를 선택하도록 바꾼다. Relay compiler로 artifact를 재생성하고 fixture·테스트 operation을 정렬한다.
7. PROD-679 slice는 current Relay connection edge 중 `readAt = null`인 ID snapshot을 클릭 시 한 번 만들고 mutation 하나를 호출한다. 성공 payload만 cache에 정규화하고, pending/실패 중 optimistic 보정이나 추가 page fetch를 하지 않는다.

이 접근은 기존 visibility SQL과 Relay Node 정규화를 재사용하고, 새 service·저장 counter·범용 batch framework 없이 승인된 계약만 추가한다.

### Allowed Alternatives

- 하나의 kind-aware update 표현이 과도하게 복잡하면 kind별 update를 같은 database transaction 안에서 실행할 수 있다. 모든 group이 함께 commit 또는 rollback되고, payload·count·중복 제거 결과가 specs와 같아야 한다.
- 기존 concrete Notification loader가 update된 ID를 visibility와 kind 손실 없이 다시 로드할 수 있음이 구현 시 확인되면 별도 payload reselect 대신 loadable Node ref를 사용할 수 있다. Follow Request source와 transaction 실패 경계는 동일하게 보존해야 한다.

### Known Traps

- UUID만으로 row를 갱신해 input typename과 저장 kind 불일치를 허용하지 않는다.
- `readAt = now()`로 반복·동시 호출 때 최초 시각을 덮어쓰지 않는다.
- hidden·missing·membership 없는 ID마다 `NOT_FOUND`를 반환하거나 존재 이유를 payload에 노출하지 않는다.
- 처리하지 않은 ID를 결과에 포함하거나 입력을 서버 전체 unread 집합으로 확장하지 않는다.
- `recipientProfiles`를 current selected Profile로 추론하거나 count를 입력 개수만큼 차감하지 않는다.
- Relay 생성 artifact를 수동 편집하거나 schema와 source operation 중 한쪽만 변경하지 않는다.
- Web `모두 읽음` 성공을 전역 badge 0으로 가정하지 않는다.

## Risks / Trade-offs

- [Breaking GraphQL input/payload가 독립 배포된 이전 client를 깨뜨릴 수 있음] → repository 내부 소비자를 한 change에서 모두 갱신하고 schema 배포 전 실제 배포 client·외부 consumer가 없는지 release gate에서 재확인한다. 확인되면 additive transition 계약을 별도 upstream 결정 없이 임의 도입하지 않고 배포를 중단한다.
- [큰 loaded ID 목록이 query parameter 수와 statement 비용을 늘릴 수 있음] → current connection의 실제 loaded ID만 전송하고 새 hard limit나 batch framework를 선제 도입하지 않는다. 운영상 한계가 확인되면 별도 계약으로 다룬다.
- [payload 재조회 사이 visibility/source가 변할 수 있음] → update와 payload hydration을 짧은 transaction에 두고 기존 visibility/source selection을 재사용한다.
- [Web 사용자는 `모두 읽음` 뒤 badge가 남는 것을 예상하지 못할 수 있음] → action은 loaded unread 기준으로 disabled 상태를 결정하고 badge는 서버 count를 그대로 유지한다. 추가 설명 UI는 승인 범위에 없으므로 만들지 않는다.

## Migration Plan

1. PROD-703 slice에서 GraphQL input/payload, schema, 기존 단건 앱 consumer, Relay artifact와 직접 호출 테스트를 같은 PR에 정렬한다.
2. API 통합 테스트로 지정 ID 처리·제외·no-op·멱등성·동시성·원자성·count를 확인한 뒤 monorepo 배포 단위에서 schema와 consumer를 함께 배포한다.
3. PROD-679 slice에서 Web `모두 읽음`, Storybook과 Web E2E를 추가하고 서버 payload 수렴을 검증한다.
4. PROD-679 owner가 두 slice와 canonical delta의 정합성을 확인하고 change를 archive한다.
5. rollback은 schema와 모든 consumer를 이전 scalar input/payload commit으로 함께 되돌린다. 한쪽만 rollback하지 않는다.

## Open Questions

없음.
