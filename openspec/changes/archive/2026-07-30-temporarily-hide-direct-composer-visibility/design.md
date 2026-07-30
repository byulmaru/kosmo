## Context

현재 Universal Post Composer는 Web과 Native가 공유하는 공개 범위 option 목록에서 `DIRECT`를 선택해 `createPost`에 전달할 수 있다. 그러나 Mentioned Profile recipient 입력·저장과 recipient 기반 조회 권한은 아직 제공되지 않으며, PROD-580은 PROD-462 완료 전까지 이 선택 표면을 임시로 제한하도록 승인했다. 구현 snapshot `4fe6578d707cffff05f3fc7175304b4c96b1002a`는 이 제한과 Storybook·E2E 회귀 검증을 이미 반영한다.

## Goals / Non-Goals

**Goals:**

- Composer의 Web·Native 공개 범위 메뉴에서 실제로 보장되는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 선택 가능하게 유지한다.
- 기본 `UNLISTED`, 세 옵션의 설명·아이콘·선택·제출 동작과 접근 가능한 메뉴/모달 흐름을 보존한다.
- `DIRECT`를 새로 선택·제출할 수 없음을 Storybook과 Composer E2E에서 확인하고, PROD-462 복원 기준을 코드 주석과 문서에 남긴다.

**Non-Goals:**

- Mentioned Profile recipient 모델, GraphQL 입력, 저장과 조회 권한 구현
- 본문 Mention 입력 UI와 notification
- 기존 DIRECT 게시글의 조회·표시 정책 변경
- `PostVisibility.DIRECT` enum, API/server visibility 코드 또는 기존 데이터 삭제
- 범용 Composer/visibility control 재설계 또는 접근성 debt 일괄 수정

## Implementation Guidance

### Current Constraints

- `PostComposer`의 `visibilityOptions`가 Web·Native 메뉴/모달의 공통 source이므로 여기서 DIRECT entry를 숨기면 두 platform surface가 함께 정렬된다.
- option union이 목록에서 추론되므로 DIRECT entry와 전용 icon import를 제거하면 새 Composer 선택값과 mutation 변수가 세 옵션에 한정된다. 서버 enum과 기존 데이터는 이 client union과 별개로 유지된다.
- 기본값 fallback은 `UNLISTED`를 가리키고, 목록 끝까지 이동하는 keyboard E2E는 마지막으로 남은 `FOLLOWERS`를 기준으로 검증해야 한다.

### Recommended Approach

`DIRECT` option 객체와 전용 icon import를 삭제하지 않고 주석 처리하고, 주석에 PROD-462의 recipient 입력·저장·조회 권한 완료 시 복원한다는 이유를 명시한다. Composer Storybook에는 메뉴에 `언급한 계정만`이 없음을 추가하고, Web E2E는 키보드 끝 이동과 공개 제출 payload가 세 옵션 계약과 함께 유지되는지 확인한다. 세 옵션의 labels, descriptions, icons, default와 submit reset은 기존 동작을 그대로 둔다.

### Allowed Alternatives

없음. 이 change의 temporary hide와 enum/server 보존 경계를 만족하는 최소 구현이 이미 적용되어 있다.

### Known Traps

- enum이나 server resolver를 삭제하면 기존 DIRECT 게시글과 후속 PROD-462 구현의 호환성을 깨뜨린다.
- DIRECT를 목록에서만 숨기고 client가 임의로 `visibility: DIRECT`를 제출하도록 두면 “신규 제출 불가” 계약을 위반한다.
- `UNLISTED` 기본값 또는 `FOLLOWERS` keyboard focus를 바꾸면 기존 Composer 계약을 회귀시킨다.
- 전체 app check와 전체 Storybook의 변경 외 실패를 이 change의 수정 task로 확장하지 않는다.

## Risks / Trade-offs

- [Risk] active `post` spec의 영구적인 Mentioned Profiles 도메인 계약과 Composer 임시 surface가 한동안 다르다 → delta spec과 PROD-462 복원 기준을 함께 유지하고, recipient 권한 계약 완료 뒤 별도 복원 변경에서 다시 동기화한다.
- [Risk] 주석 처리된 option이 장기간 복원되지 않을 수 있다 → TODO에 PROD-462를 명시하고, 후속 이슈가 해당 완료·검증 증거를 소유하게 한다.
- [Risk] 변경 외 aggregate check 실패가 전체 결과를 흐릴 수 있다 → targeted Posts story, Storybook build, Composer E2E와 Web check를 별도 증거로 기록한다.

## Migration Plan

DB/API migration은 없다. 이미 배포된 client는 세 옵션만 노출하며, rollback이 필요하면 PROD-580 변경을 되돌려 기존 Composer option을 복구할 수 있다. 정식 복원은 PROD-462의 recipient 입력·저장·조회 권한 검증이 완료된 뒤 별도 변경으로 수행한다.

## Open Questions

없음.
