## Session Context

[PROD-1226](https://linear.app/byulmaru/issue/PROD-1226)의 새 프로필 기본 공개 범위 변경을 위한 작업 메모다.
제품 계약은 사용자 요청과 `docs/domain/objects/profile.md`, `docs/domain/policies/first-profile-onboarding.md`가 소유한다.

## Choice Notes

### 신규 생성과 과거 값의 해석을 구분한다

- Date: 2026-10-24
- Upstream context: PROD-1226의 신규 기본값 변경과 기존 프로필·조회 실패 처리 보존 범위.
- Choice: 새 Local Profile의 명시적 생성 값과 온보딩 초안만 Public으로 맞춘다.
- Reason: 실제 생성 resolver가 값을 저장하며, DB column은 nullable이고 기존 조회 대체 처리는 독립되어 있다.
- Alternatives: DB default·기존 row backfill·모든 Unlisted fallback 변경.
- Consequences: schema와 데이터 migration 없이 구현할 수 있다. 기존 저장값과 null의 해석은 그대로 둔다.

### 기존 저장·생략 흐름을 사용한다

- Date: 2026-10-24
- Upstream context: PROD-1226 및 첫 Profile 온보딩 정책의 현재 단계 저장·미저장 생략 규칙.
- Choice: 생성 시 Public을 저장하고, 게시 설정 생략이나 바로 시작에 추가 저장 action을 넣지 않는다.
- Reason: UI와 서버의 생성 기본값을 맞추면 기존 흐름에서도 저장과 생략 결과가 일치한다.
- Alternatives: 화면 초기값만 변경하거나 생략할 때 기본값을 다시 저장.
- Consequences: ‘전체 공개’라는 기존 이름·설명과 자동 승인 Open을 유지한다. 다른 공개 범위를 저장한 사용자의 선택도 보존한다.

## Unresolved Questions

- 없음. 실제 배포·운영 데이터·플랫폼 runtime은 확인하지 않았으며, 이 문서가 그 검증이나 새로운 운영 승인을 대신하지 않는다.
