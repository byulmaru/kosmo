## Current Constraints

2026-10-04 사용자 결정에 따라 기존 Hashtag 관련 Profile 목록 페이지를 태그 상세 페이지로 사용한다.
프로필 화면에 추가한 태그 뮤트 벨·메뉴는 채택하지 않는다. 이 문서는 구현·검증 메모이며 제품 계약은
ADR 0021·Hashtag Mute Rule·Linear가 소유한다.

## Practical Approach

- 헤더 우측 Bell/BellOff는 중간 메뉴 없이 기존 뮤트·해제 확인창을 연다.
- 기존 TagChip 링크가 exact Hashtag identity를 전달하는 탐색을 유지한다. 태그 상세 페이지의 현재 Hashtag
  맥락에 뮤트 상태와 설정·해제 action을 연결한다. 별도 상세 route나 알림 설정 화면을 만들지 않는다.
- 기존 Profile Mute 확인·피드백 presentation을 재사용하되 대상은 Hashtag, Owner는 selected Profile이다.
  Profile 자체의 mutation이나 게시물 숨김 설명을 재사용하지 않는다.
- PROD-1029의 실제 API를 소비한다. 현재 UI는 Notification 전용 영구 규칙이며 범위·Decision·기간 입력을
  제공하지 않는다. 기존 규칙의 다른 Scope를 보존하고, Notification이 없는 다른 Scope의 활성 임시 규칙에는 영구 Notification을 추가하지 않고
  기존 Scope·Decision·만료를 유지한다. 만료 후 상태를 다시 읽어 설정할 수 있음을 안내한다. 이미 Notification을
  포함한 임시 복합 규칙의 해제는 Notification만 제거하고 나머지 Scope·Decision·만료를 보존한다.
- 조회 중·실패를 미뮤트로 확정하지 않는다. 취소하면 요청하지 않고, 실패하면 기존 서버 확정 상태를 유지하며
  재시도할 수 있다. 성공하면 별도 새로고침·재조회·재진입 없이 상세 페이지의 상태와 다음 action을 갱신한다.
- 응답 유실 시 서버 상태를 다시 조회한다. Profile·Account·Hashtag 전환 후 이전 요청의 상태·Toast·focus가
  새 대상에 적용되지 않도록 기존 actor 경계를 사용한다.
- 확인 종료 후 focus는 상세 페이지의 유효한 control로 돌아오거나 이어진다. 관련 Profile 목록·pagination·
  실패 복구를 유지하며, 뮤트로 목록 후보를 숨기지 않는다. selected Profile이 없어도 기존 목록 조회를 유지한다.

## Verification and Handoff

- 기존 프로필 화면용 action과 Storybook·E2E를 새 진입점에 맞게 재검토한다. 승인에 따라 로컬 구현과 테스트를 수정했다.
- 실제 API로 TagChip 탐색부터 상세 페이지의 생성·조회·해제까지 검증한다. 직접 상세 진입도 같은 identity를 사용한다.
- 취소, 오류·재시도, 중복 제출, 늦은 응답, 다른 Scope·임시 규칙 보존, 접근성·focus와 기존 탐색을 검증한다.
- Storybook 실행 후 상세 페이지의 뮤트 전·후, 확인, 오류 상태를 실제 캡처한다. 기존 프로필 화면 캡처로 대체하지 않는다.
- 기존 CI는 이전 구현의 역사적 결과다. 현재 검증 결과는 tasks.md에 기록하며 Native runtime은 미검증이다.
