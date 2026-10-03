## Current Constraints

이 문서는 구현 시 다시 검토할 작업 메모다. 제품 계약과 완료 범위는 최신 Linear·canonical 및 현재 사용자 지시를 따른다.

2026-10-02 `main`의 `a890cc8766c1350ef5f5cc10c6b236c966bafb09`에서 확인했다.

| 경계           | 현재 확인한 근거                                                                                                                                         | 이번 작업에서의 의미                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 태그 표시·탐색 | `apps/app/src/components/profile/ProfileHero.tsx`의 `ProfileTagLink`는 `tag.id`를 `/hashtags/[hashtagId]/profiles`에 전달한다.                           | identity와 기존 탐색을 유지한다. 해당 위치에 Hashtag Mute action은 아직 없다.                             |
| 기존 뮤트 UI   | `apps/app/src/components/profile/ProfileMuteAction.tsx`와 `docs/design/profile-mute-block.md`에 확인창·pending·오류·재시도·Toast·focus 복귀 흐름이 있다. | 공용 확인 presentation을 재사용한다. 대상과 결과 설명은 Hashtag 계약에 맞춘다.                            |
| 서버 계약      | `apps/api/src`, `packages/core`, `apps/app/src`에서 Hashtag Mute 구현을 찾지 못했다. PROD-1029는 Todo이며 선행 Block이다.                                | 구체 GraphQL 이름·응답 shape를 미리 정하지 않는다. 선행 결과를 읽고 실제 클라이언트 계약을 맞춘다.        |
| actor 격리     | `memory/frontend/relay-operation-env-cache.md`는 selected Profile 전환 시 새 Relay Environment·Store를 사용하도록 정한다.                                | 기존 provider 경계를 활용하고 늦은 이전 요청의 상태·Toast·focus가 새 actor로 넘어오지 않게 한다.          |
| Figma 참고     | `7541:14061`에는 ProfileHero의 muted 상태·해제 action이 있고 `1951:3715`에는 Hashtag 관련 Profile 목록이 있다.                                           | 조회한 노드는 기존 Profile Mute·탐색의 근거다. 태그 전용 뮤트 진입점이 확정됐다는 근거로 사용하지 않는다. |

## Practical Approach

- TagChip 표시와 기존 링크는 유지한다. Hashtag를 대상으로 하는 action을 태그 맥락의 기존 메뉴·확인 presentation과 조합한다. 구체 component 배치는 구현 시 기존 공개 태그 UI에 맞추며 새로운 범위·방식·기간 설정 화면은 만들지 않는다.
- 표시 이름은 대상 안내에만 쓰고 mutation target은 서버가 준 Hashtag identity를 사용한다. Owner는 selected Profile이며 공개 Profile의 소유자와 혼동하지 않는다.
- 서버의 현재 Notification Rule·적용 상태를 읽은 뒤 설정 또는 해제 action을 제공한다. 조회 중·조회 실패를 미뮤트로 표시하거나 중복 생성을 허용하지 않는다.
- 현재 UI에서 생성하는 규칙은 Notification Scope만 사용하는 영구 규칙이다. Notification에서는 Exclude·Collapse가 모두 새 알림 억제를 뜻하므로 생성 input은 Exclude를 사용하고 사용자에게 Decision을 고르게 하지 않는 접근을 제안한다. 이 필드 매핑은 구현 메모이며 실제 PROD-1029 API와 대조한다. 만료 입력·preset·picker를 추가하지 않는다. 일반 서버 계약의 미래 만료 지원을 삭제하거나 기존 기간 규칙을 영구로 덮어쓰는 작업도 포함하지 않는다.
- 같은 selected Profile이 같은 Hashtag에 Notification 이외 Scope의 활성 임시 규칙을 갖고 있으면 기존 Scope·Decision·만료 시각을 유지하고 Notification을 추가하지 않는다. 만료 시각은 모든 Scope에 함께 적용되므로 기존 규칙을 영구화하거나 Notification만 남겨 다른 Scope의 임시 동작을 일찍 끝내지 않는다. 규칙이 만료된 뒤 상태를 다시 불러오면 설정할 수 있다고 안내한다.
- action owner에 Relay fragment·mutation을 두고 표준 `useMutation`의 in-flight 상태와 서버 payload로 수렴시킨다. 기존 Profile Mute 코드의 Promise wrapper·별도 pending 구현은 현재 Relay 지침과 대조하고 그대로 복제하지 않는다.
- 생성·해제 확인을 취소하면 요청하지 않고 기존 서버 확정 상태와 action을 유지한다. 기존 focus 복귀 흐름도 보존한다.
- 생성·해제가 성공하면 별도 새로고침·재조회·재진입 없이 현재 화면의 상태와 다음 action에 결과를 반영한다. 구체적인 반영 시간이나 render timing은 계약하거나 테스트하지 않는다.
- 오류가 발생하면 기존 서버 확정 상태를 유지한다. 응답을 잃었거나 동일 Hashtag의 현재 상태가 바뀐 경우에는 해당 상태를 다시 조회해 다음 action을 결정한다.
- Hashtag identity가 다른 태그로 바뀌거나 actor가 전환되면 이전 확인·오류·완료 피드백을 새 대상에 적용하지 않는다. Hashtag의 공개 Node identity만으로 viewer별 상태를 전역 공유하지 않는다.
- 해제는 현재 selected Profile이 소유한 정확한 Rule에 실행한다. 재조회 결과 만료·해제가 확인됐으면 그 결과에 맞춰 표시하며, 시간이 지났거나 사용자가 클릭했다는 이유만으로 서버 요청이 성공했다고 표시하지 않는다.

## Alternatives and Traps

- 새 설정 화면에서 Scope·Decision·만료를 모두 입력하게 하는 안은 채택하지 않았다. 서버가 해당 필드를 지원한다는 사실은 설정 화면 추가의 근거가 아니다.
- Profile Mute와 Hashtag Mute는 다른 대상이다. 기존 `muteProfile` mutation이나 Profile ID로 대체하면 안 된다.
- Profile Mute의 “게시물이 홈과 로컬 타임라인에 숨겨진다”는 설명은 재사용하지 않는다. 확인창은 해당 태그를 프로필에 단 사람의 새 알림만 끄고 기존 알림은 유지한다는 결과를 설명한다. 해제는 앞으로 발생하는 알림을 다시 받을 수 있다는 의미이며 과거 억제 알림의 복구를 약속하지 않는다.
- 선행 API를 임시 client state로 대신하거나 mock 성공만으로 종단 간 완료를 선언하지 않는다. API가 준비되지 않으면 통합 검증을 pending으로 남긴다.

## Risks / Limits

- UI 완료는 목록·검색·Notification 정책 구현 완료를 뜻하지 않는다. 실제 효과의 검증은 각 소비자 이슈가 소유한다.
- 일반 Scope·만료 지원과 Local 정책 정렬은 PROD-1029가 소유한다. 현재 스펙 보정에 다른 작업 공간의 미커밋 문서나 서버 구현을 가져오지 않는다.
- 제품 runtime 검증은 미실행이다. Web의 실제 생성·해제 흐름을 검증하며 Native 결과는 공용 코드만으로 완료 처리하지 않는다. 기존 Profile Tag의 Native 출시 검증 경계를 유지한다.
- 현재 보존된 스펙에는 실행 코드·DB·배포 변경이 없다. 구현 시 schema·payload가 달라지면 이 작업 메모를 수정하고 실제 변경의 rollback 영향을 PR에서 설명한다.

## Open Questions

- 현재 UI의 적용 결과·영구 설정은 사용자 지시로 확정했다. 추가 제품 질문은 없다.
- 실제 API 이름·payload·태그 action의 component 조합은 PROD-1029 결과와 기존 UI를 읽고 정한다. 이는 현재 계약 안의 구현 선택이며 새 설정 화면 승인을 요구하지 않는다.
