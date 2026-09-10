## Why

원격 Note의 canonical summary와 body에는 문자 수 제한이 없다. PROD-465는 사용자에게 승인받은
10,000자 수신 기준과 초과 시 원자적 거부를 제공한다. 파싱과 응답 수신 자체의 자원 보호는 별도 후속 작업에서 다룬다.

## What Changes

- 정규화한 summary와 body Plain Text의 UTF-16 `.length` 합계가 10,000 이하이면 기존 수신 조건을 적용한다.
- 10,000자를 초과하면 자르지 않고 전체 no-op으로 처리하며 새 row와 후속 effect를 남기지 않는다.
- 원문 없는 거부 metric과 구조화 로그를 제공하고 내부 오류를 구분한다.
- Local 500자 기준은 유지한다. 원격 Quote 원문은 원격 기준을 따르며 Local Quote 작성분에 합산하지 않는다.
- 입력 byte, HTML node·깊이, canonical JSON 크기와 hydration 응답 보호는 PROD-931로 이관한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`.
- Linear Contract: [PROD-465](https://linear.app/byulmaru/issue/PROD-465)의 현재 계약·완료 기준(2026-09-09).
- Linear Implementations: PROD-465가 이 change의 구현·회귀·통합 검증·동기화·archive를 소유한다.
- 사용자 결정: 2026-09-09 summary/body 합계 10,000자, UTF-16 `.length`, 초과 시 전체 no-op 및 후속 분리 승인.

## Capabilities

### New Capabilities

- `activitypub-remote-note-resource-budget`: 이번 전달 범위는 원격 Note의 10,000자 수신 한계와 원자적 거부다.

### Modified Capabilities

없음. 기존 canonical 저장 형식과 Local 작성 검증을 유지한다.

## Impact

core 원격 content projection, Fedify inbound 거부 경계와 관련 테스트에 영향을 준다. 공개 GraphQL·DB schema
변경이나 기존 데이터 migration은 없다. PROD-661의 projector 추출과 PROD-509의 신규 materialization은 구현하지 않는다.
PROD-509에는 길이·실패 계약을 인계하며 hydration 보호를 제공한다고 설명하지 않는다.

[PROD-931](https://linear.app/byulmaru/issue/PROD-931)은 byte·HTML 구조·JSON·hydration 보호 및 Fedify 업데이트/upstream 기여 검토를 소유한다.
이 후속은 현재 change의 완료를 막지 않는다. `pnpm patch`는 선택한 수단이 아니다. Quote materialization,
Media 다운로드, rate limit·quota·retention과 Update/Delete도 제외한다. 10,000자 검사로 전체 DoS가 해결되지는 않는다.
