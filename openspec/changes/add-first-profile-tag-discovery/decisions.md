## Session Context

PROD-1147의 현재 계획 메모다. 제품 권위는 canonical·Linear와 실제 사용자 선택에 있다.

## Choice Notes

### 첫 코스모 Profile을 만든 사용자 모두에게 적용

- Date: 2026-10-23
- Upstream context: 현재 대화의 명시적 사용자 선택과 `docs/domain/policies/first-profile-tag-discovery.md`.
- Choice: 신규 가입과 기존 별마루 계정 로그인 뒤 첫 Profile을 준비한 사용자에게 동일하게 적용한다.
- Reason: 첫 코스모 Profile의 태그를 사람 찾기로 연결하는 결과가 같다.
- Alternatives: 신규 가입만 적용하는 선택은 채택하지 않았다.
- Consequences: 기존 Profile 보유자에게 새 온보딩을 시작시키거나 재로그인 후 재개하지 않는다.

### 단계별 저장 결과를 재사용

- Date: 2026-10-23
- Upstream context: [robin-maki 리뷰](https://github.com/byulmaru/kosmo/pull/1254#pullrequestreview-5616180870), PR #1254 `f171bf55f99a23704d7c01d597276c97da7bd75d`, PROD-1147의 실제 등록 태그 기준.
- Choice: 완료 방식별 별도 분기 없이 생성·선택한 Profile의 실제 저장 태그를 사용한다.
- Reason: 첫 단계의 생성·선택과 이후 단계별 저장은 이미 분리됐다. `바로 시작`·생략·완료는 추가 저장이나 저장값 삭제를 하지 않는다. 미저장 초안을 읽거나 완료 때 일괄 저장할 이유가 없다.
- Alternatives: `바로 시작`을 별도 사람 찾기 생략 신호로 만드는 안은 기존 이슈에 없는 분기를 추가하므로 계획에 넣지 않는다. 사용자에게 두 번째 선택의 승인을 받았다고 기록하지 않는다.
- Consequences: 태그 저장 성공 뒤에는 사람 찾기로 연결하고, 태그 저장을 생략했거나 저장에 실패해 실제 태그가 없으면 건너뛴다. 응답 유실에 대한 핸들 기반 복구나 완료 시점 일괄 저장을 되살리지 않는다.

### 최신 공개 콘텐츠 범위와 선행 작업

- Date: 2026-10-23
- Upstream context: 최신 PROD-836·PROD-681·PROD-1146과 `docs/domain/policies/public-content-onboarding.md`.
- Choice: 오래된 자동 복귀·Profile 0개 전체 스킵 문구를 이번 범위에서 제외한다. 계획 브랜치는 최신 main에서 만들고, 구현 시 미병합 PROD-1146의 최신 상태를 먼저 확인한다.
- Reason: 공개 콘텐츠 자동 복귀는 이미 범위에서 제외됐고, 첫 Profile 완료 연결부는 main에 아직 없다.
- Alternatives: 과거 복귀 흐름을 다시 구현하거나 선행 PR을 복제하지 않는다.
- Consequences: PROD-1146 병합 후 최신 main에 연결하는 것을 기본 구현 순서로 제안한다. 병합 전 구현이 필요하면 현재 owner·Stack 상태를 확인하고 실제 의존 브랜치를 기준으로 계획을 조정한다.

### 미병합 선행 PR 위에서 구현

- Date: 2026-10-23
- Upstream context: Implement 대화에서 사용자가 PR #1254 위의 의존 Stack 진행을 선택했다.
- Choice: `main → PROD-1146 → PROD-1147`으로 연결하고 부모 코드와 Ready 상태를 유지한다.
- Alternatives: PR #1254 병합을 기다린 뒤 main에서 구현하는 순서.
- Consequences: PROD-1147은 PR #1254에 의존하며, 부모의 후속 변경이나 병합 시 자식 Stack 상태를 다시 확인한다.

## Unresolved Questions

- 없음. PR #1254의 병합·최신 head와 PROD-1148 연결부 존재 여부는 다음 세션의 상태 확인 항목이다.
