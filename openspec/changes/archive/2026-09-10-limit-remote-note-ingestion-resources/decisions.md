## Authority / Provenance

`docs/domain/objects/post-content.md`와 [PROD-465](https://linear.app/byulmaru/issue/PROD-465)의
2026-09-09 현재 계약 및 사용자의 10,000자·UTF-16·전체 no-op·후속 분리 승인을 근거로 한다.

## Active Decisions

### D1. 원격 수신 한계는 정규화된 합계 10,000자다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, PROD-465 현재 계약.
- Status: Active
- Decision Outcome: summary와 body Plain Text의 UTF-16 `.length` 합계 10,000 이하를 허용한다. 기존 canonical 줄바꿈은 포함하고 HTML markup·Media·표시용 구분자는 제외한다.
- Alternatives Considered: 원격 무제한과 grapheme·byte 기준 대신 사용자가 선택한 UTF-16 합계를 따른다.
- Consequences: Local 500자는 유지한다. Quote 원문에는 원격 기준을 적용하고 Local Quote 작성분에는 원문을 합산하지 않는다.
- Confirmation / Follow-up: 9,999·10,000·10,001과 Unicode·정규화·합산 경계를 검증한다.

### D2. 초과 Note는 자르지 않고 원자적으로 거부한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, PROD-465 완료 기준.
- Status: Active
- Decision Outcome: 초과 시 전체 no-op으로 처리하고 Post·mapping·content·새 Media 및 해당 생성의 후속 effect를 남기지 않는다. 기존 duplicate Post는 변경하지 않는다.
- Alternatives Considered: 잘라 저장하는 방안 대신 사용자가 확정한 전체 거부를 따른다.
- Consequences: 전용 길이 오류만 거부로 처리하고 원문 없는 관측을 남기며 내부 오류는 전파한다.
- Confirmation / Follow-up: embedded/IRI, Media 동반 입력, duplicate와 effect 부재를 검증한다.

### D3. 나머지 자원 보호는 독립 후속으로 분리한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-465 후속 범위, 사용자 범위 분리 승인, [PROD-931](https://linear.app/byulmaru/issue/PROD-931).
- Status: Active
- Decision Outcome: 원문 byte·HTML 구조·canonical JSON·hydration 보호와 Fedify 수단 검토는 PROD-931이 소유한다. 현재 change의 task나 완료 조건으로 삼지 않는다.
- Alternatives Considered: 전체 resource budget을 이번에 확정하는 방안은 사용자 결정으로 연기했다.
- Consequences: PROD-465는 전체 DoS 해결을 보장하지 않는다. PROD-509에 hydration 보호가 제공된다는 전제를 제거한다. `pnpm patch`는 승인된 수단이 아니다.
- Confirmation / Follow-up: PROD-931 담당자가 한도·계산 기준·loader 영향과 유지 책임을 확정하고 자체 구현·검증·필요한 archive를 소유한다.

## Remaining Decisions

현재 범위에 남은 미결정은 없다. 최종 Spec Gate는 2026-09-10 사용자 승인으로 완료됐으며 남은 미결정은 없다.

## Superseded Decisions

### S1. 원격 무제한 및 공통 loader 확정 대기

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-465 현재 계약과 사용자 후속 분리 승인.
- Status: Superseded
- Decision Outcome: 이전 D1의 원격 무제한은 현재 D1으로 대체했다. 원격 500자 해석도 폐기 상태를 유지한다.
- Consequences: 이전 U1의 공통 loader Actor/context 범위 확대와 R1/R2의 budget·loader 미결정은 D3에 따라 PROD-931로 이관했다. 현재 change에 Blocked decision으로 남기지 않으며 승인된 구현 선택으로도 간주하지 않는다.
