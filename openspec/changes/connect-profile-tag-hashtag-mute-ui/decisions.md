## Session Context

[PROD-735](https://linear.app/byulmaru/issue/PROD-735)의 UI 연결 범위를 정리하는 작업 메모다. 이 문서는 ADR이나 별도의 승인 기록이 아니다.

## Choice Notes

### 현재 UI는 영구 뮤트만 제공

- Date: 2026-10-02
- Upstream context: 현재 사용자의 “현재는 영구 뮤트만 제공” 지시. `docs/design/profile-mute-block.md`의 기존 Profile Mute UI도 기간 선택을 제공하지 않는다.
- Choice: Profile Tag에서 생성하는 뮤트는 영구이며 기간 선택·만료 입력을 제공하지 않는다.
- Reason: 현재 사용자가 지정한 제공 범위를 따른다.
- Alternatives: 직접 만료 일시 입력, 기간 preset. 이번 UI 범위에 포함하지 않는다.
- Consequences: PROD-1029의 일반 미래 만료 지원을 제거하지 않는다. 태그 UI의 영구 생성과 기존 서버 규칙의 현재 상태 조회·해제를 구분한다.

### 현재 이슈의 UI 범위를 유지

- Date: 2026-10-02
- Upstream context: PROD-735의 2026-09-30 범위 분리와 2026-10-02 선행 Block 정리, PROD-1029의 현재 본문·관계.
- Choice: 선행 Block은 PROD-1029이며 UI 생성·조회·해제와 그 클라이언트 흐름을 검증한다.
- Reason: 최신 Linear가 독립적인 전달 결과와 소유자를 구분한다.
- Alternatives: 과거 통합 스펙을 그대로 이어받는 방식은 현재 범위와 다르다.
- Consequences: Post 목록·검색·알림 소비자 완료를 UI 완료로 주장하지 않고 해당 이슈의 구현도 추가하지 않는다.

### 프로필 태그에 따른 새 알림만 제어

- Date: 2026-10-02
- Upstream context: 현재 사용자가 프로필 해시태그만 존재하므로 해당 태그를 프로필에 단 사람의 새 알림만 끄고 게시물 해시태그 기능은 추후 구현하도록 지시했다.
- Choice: 기존 뮤트 확인 UI를 활용해 Notification에만 적용되는 영구 뮤트를 설정·해제한다. 범위·숨기기/접기·기간 선택은 제공하지 않는다.
- Reason: 현재 제공하는 프로필 해시태그의 사용 목적에 범위를 맞춘다.
- Alternatives: 게시물 숨김·검색·게시물 태그 알림까지 함께 제어하는 방식은 후속 범위다.
- Consequences: PROD-1048이 실제 새 알림 억제를 소유한다. UI는 그 기능에 필요한 규칙 관리 흐름을 제공하며 기존 알림을 삭제하거나 과거 알림을 복구한다고 안내하지 않는다.

## Unresolved Questions

- 남은 제품 결정은 없다. API와 component 배치는 구현 시 현재 결과를 확인해 정한다.
- 기존 Profile Mute 확인·피드백을 재사용하되 Profile 전체 뮤트 mutation과 게시물 숨김 설명은 사용하지 않는다.
