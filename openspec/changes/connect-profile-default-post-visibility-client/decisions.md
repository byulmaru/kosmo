## Context

이 기록은 PROD-667의 승인된 Frontend Feature Slice, Profile·Post·Reply·settings canonical, PROD-648 Backend API와
PROD-653·PROD-645의 settings 소유 경계를 반영한다. Backend 저장·권한 결정은 Backend change에 남기고,
Frontend가 여러 surface에서 일관되게 지켜야 할 seed·state·integration 결정만 기록한다.

## Decision Records

### Profile 기본값은 새 일반 Post·Reply Composer의 seed로만 사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`,
  `docs/design/reply-composer.md`, `PROD-667`
- Status: Active
- Context / Problem: Relay Profile 값이 바뀔 때 열린 draft를 동기화하면 사용자가 선택한 개별 Visibility와 작성
  상태를 잃을 수 있다.
- Decision Outcome: selected Profile 기본값은 새 일반 Post·Reply 문맥의 initial/reset seed로만 사용한다. 열린
  draft를 자동 덮어쓰지 않고 Composer의 개별 Visibility 변경도 Profile 설정을 저장하지 않는다.
- Alternatives Considered: Relay record와 열린 draft의 지속 동기화, Reply Parent Visibility 상속, Composer
  변경 자동 저장. 모두 draft 독립성과 승인된 소유 계약을 위반한다.
- Consequences: client state는 fragment 값을 effect로 계속 복사하지 않고 Profile·Parent·Environment의 새
  문맥 경계에서만 초기화해야 한다.
- Confirmation / Follow-up: initial seed, fallback, 열린 draft, 제출 성공 reset과 문맥 전환 test로 확인한다.

### 설정 control과 Composer는 normalized Relay Profile 값을 공유한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-667`
- Status: Active
- Context / Problem: 별도 client 전역 설정이나 surface별 cache를 두면 settings save 이후 다음 Composer가 서로
  다른 기본값을 볼 수 있다.
- Decision Outcome: 설정 control과 Composer는 같은 Profile identity의 Relay fragment를 소비하고, 기존
  `updateProfile` payload의 Profile로 normalized record를 수렴시킨다. 열린 draft 독립성은 별도 local state로
  유지한다.
- Alternatives Considered: 전역 client setting store, settings 전용 query/cache, mutation 성공 뒤 수동
  surface별 복사. Profile identity와 서버 payload의 단일 수렴 경계를 중복하므로 채택하지 않는다.
- Consequences: fragment와 fixture는 Profile ID를 유지해야 하고 mutation completion은 현재 Profile·Environment
  문맥과 대조해야 한다.
- Confirmation / Follow-up: 저장 성공 뒤 다음 Composer seed와 Profile/Environment 전환의 늦은 completion
  격리를 component·Storybook test로 확인한다.

### Profile child 연결과 generic settings host 책임을 분리한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-667`, `PROD-653`,
  `PROD-645`
- Status: Active
- Context / Problem: PROD-667이 Profile 설정을 실제 `/settings`에 연결해야 하지만 generic route·navigation과
  Byulmaru ID Account entry를 함께 소유하면 독립 Feature Slice 경계가 무너진다.
- Decision Outcome: PROD-667은 current Profile identity에 연결된 설정 control과 Profile child integration을
  소유한다. PROD-653은 generic route·page shell·navigation과 정보 구조를, PROD-645는 Account entry의 label·
  external navigation·오류 처리를 유지한다.
- Alternatives Considered: PROD-667의 임시 settings route 생성, Account entry 재구현, PROD-653에서 Profile
  설정 기능 재구현. 모두 승인된 서비스·이슈 소유권과 독립 검증 책임을 침범한다.
- Consequences: standalone control 검증만으로 `/settings` 연결을 완료했다고 할 수 없으며, 실제 host가 준비된
  뒤 Profile child 연결과 페이지 수준 경계를 확인해야 한다.
- Confirmation / Follow-up: 실제 canonical `/settings`에서 Account entry 다음 Profile identity/control 순서와
  두 child의 독립 오류 상태를 검증한다.

### 존재하지 않는 Quote와 Repost·DIRECT를 현재 Frontend 완료 범위에서 제외한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-667`
- Status: Active
- Context / Problem: canonical은 향후 Quote가 같은 Profile 기본값을 소비하는 방향을 기록하지만 현재 Quote
  Composer가 없어 구현·interaction 검증이 불가능하다. Repost와 DIRECT도 별도 기존 계약을 가진다.
- Decision Outcome: 현재 change는 실제 존재하는 일반 Post·Reply만 구현·검증한다. Quote surface를 만들지 않고
  미래 호환 방향은 보존한다. Repost Visibility와 `DIRECT` recipient·옵션 복원은 변경하지 않는다.
- Alternatives Considered: Quote surface 선행 구현, fixture-only Quote 완료 주장, Repost나 `DIRECT`까지 현재
  control에 포함. 모두 PROD-667의 승인 범위와 독립 완료 책임을 넘는다.
- Consequences: Quote 지원은 실제 surface owner가 생겼을 때 별도 계약·검증으로 수행하며 현재 archive를
  막지 않는다.
- Confirmation / Follow-up: implementation diff와 test/story 목록에 Quote·Repost·DIRECT 신규 구현이 없는지
  확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
