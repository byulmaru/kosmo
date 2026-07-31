## Context

이 결정 기록은 PROD-580의 Composer 임시 공개 범위 계약, `docs/domain/objects/post.md`의 Post Visibility·작성 경계, 그리고 해당 계약을 구현한 snapshot의 설계·검증 결과를 반영한다. 2026-07-30 사람 승인은 최소 OpenSpec change를 생성하고 active `post` capability를 delta로 동기화하는 범위까지 확정했다.

## Decision Records

### PROD-462 완료 전 Composer는 세 공개 범위만 노출한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4)
- Status: Active
- Context / Problem: Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한이 없는데 Composer가 DIRECT를 선택·제출할 수 있었다.
- Decision Outcome: PROD-462가 해당 recipient·권한 계약을 완료하기 전까지 Web·Native Composer는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 표시하고 새 `DIRECT` 선택·제출을 허용하지 않는다. `UNLISTED` 기본값과 세 옵션의 기존 동작은 유지한다.
- Alternatives Considered: recipient 계약이 없는 상태에서 DIRECT를 계속 노출하는 방식은 사용자가 보장되지 않는 조회 범위를 기대하게 하므로 선택하지 않는다. 도메인의 Post Visibility enum/기존 data를 제거하는 방식은 PROD-580 제외 범위를 침범하므로 선택하지 않는다.
- Consequences: Composer의 선택 surface와 client 선택 union은 임시로 세 값에 한정된다. 기존 서버 enum, 저장된 DIRECT Post와 후속 recipient 구현의 호환성은 유지된다.
- Confirmation / Follow-up: Posts Storybook 37/37, Storybook build, Composer E2E 1/1과 targeted Web checks가 이 계약을 확인한다. PROD-462 완료·검증 승인 뒤 별도 복원 변경을 만든다.

### DIRECT client option은 주석으로 보존하고 unused icon import는 제거한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4)
- Status: Active
- Context / Problem: 임시 UI 제한 뒤에도 enum·서버·기존 DIRECT 데이터와 후속 복원 경계를 보존해야 한다.
- Decision Outcome: Composer option 목록의 DIRECT 객체만 주석으로 보존하고 사용하지 않는 `AtSignIcon` import는 제거하며, 주석에 `TODO(PROD-462)`와 recipient 입력·저장·DIRECT 조회 권한 완료 시 복원 기준을 기록한다.
- Alternatives Considered: enum/server까지 삭제하는 방식은 기존 데이터와 후속 구현을 깨뜨린다. 별도 feature flag를 추가하는 방식은 이 단일 임시 표면 제한에 불필요한 상태·배포 경계를 늘린다.
- Consequences: 현재 client 메뉴에는 DIRECT가 없지만 복원 시 주석에 남은 원래 label·description·icon 식별자를 재사용하고 `AtSignIcon` import를 함께 복원할 수 있다. 주석은 장기 보류가 되지 않도록 후속 issue를 가리킨다.
- Confirmation / Follow-up: archived 최종 상태에서 DIRECT 객체 주석과 TODO, `AtSignIcon` import 제거를 확인한다. PROD-462의 완료 증거가 생기면 별도 변경에서 option·import·recipient 제출 경계를 함께 재검토한다.

### 사람 승인된 최소 OpenSpec으로 active post capability를 delta 동기화한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4), 2026-07-30 사용자 승인(최소 OpenSpec 생성 및 active `post` sync)
- Status: Active
- Context / Problem: 기존 active `post` spec은 네 옵션을 MUST로 적고 있어 구현된 임시 세 옵션 Composer와 충돌했으므로, 승인된 delta를 active spec에 반영해 런타임과 규범 문서를 동기화해야 했다.
- Decision Outcome: `post` capability의 MODIFIED delta에 기존 requirement 전체를 보존하면서 PROD-462 완료 전 세 옵션·신규 DIRECT 제출 불가·복원 기준을 기록했다. 구현과 검증 완료 뒤 delta를 `openspec/specs/post/spec.md`에 반영하고 change를 archive했다. canonical 도메인 문서는 변경하지 않았다.
- Alternatives Considered: active spec을 OpenSpec lifecycle 밖에서 직접 편집하는 방식은 delta와 완료 근거를 남기지 않으므로 선택하지 않았다. implementation snapshot만 남기고 명세를 동기화하지 않는 방식도 active contract와 구현의 drift를 남기므로 선택하지 않았다.
- Consequences: active `post` requirement와 Composer의 임시 세 옵션 계약이 일치하며, archived change가 적용한 delta·결정·완료 증거를 보존한다. 이 change는 Composer visibility 외 도메인 enum·server·Mention 계약을 소유하지 않는다.
- Confirmation / Follow-up: strict OpenSpec validation 통과와 `openspec/specs/post/spec.md`의 세 옵션 계약 반영을 확인한 뒤 change archive를 완료했다. PROD-462 완료 전까지 active spec과 Composer에서 이 임시 계약을 유지한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
