---
name: kosmo-design-audit
description: Audit KOSMO Figma components, tokens, states, accessibility, themes, responsive layouts, or design drift. Use before a Figma source edit or handoff.
---

# KOSMO Design Audit

설치된 `figma:figma-use`로 Figma 구조를 읽고 KOSMO 디자인 시스템의 누락과 드리프트를 근거 중심으로 감사한다. 세부 구조·값·시각 증거는 대상에 맞는 reference만 읽는다.

## Route

- 정확한 Figma 파일, node, source/instance 범위, 플랫폼과 상태를 먼저 정한다.
- 기준 브랜치의 `docs/design/*.md`와 대상에 필요한 [audit rules](references/audit-rules.md) 또는 [Figma inspection](references/figma-inspection.md)만 읽는다.
- `use_figma`를 호출하기 전 `figma:figma-use`를 로드하고, 감사 호출은 읽기 전용으로 유지한다.
- 구조, binding, geometry, screenshot 증거를 모으고 `확정`, `위험`, `검증 공백`으로 분류한다.
- source 수정 제안은 영향받는 instance와 최소 범위를 포함한다. consumer override로 source 문제를 가리지 않는다.
- 사용자가 제공한 증거만 사용하도록 제한했거나 Figma 접근이 없으면 Figma 호출을 생략한다. 제공 증거로 확정 가능한 항목과 최소 증거 누락을 분리한다.

## Authority and write boundary

- 승인된 대상별 계약과 기준 브랜치의 canonical foundation을 우선한다. 미병합 제안은 사용자가 명시적으로 선택한 경우에만 후보 계약으로 분리해 기록한다.
- Figma 값은 증거이며 canonical과 충돌할 때 authority가 아니다. reference의 취향 규칙은 계약을 덮지 않는다.
- 감사 단계는 읽기 전용이다. 사용자가 수정을 요청하면 먼저 node·값·영향 범위와 제안을 보고하고 명시적 승인을 받은 뒤 source를 수정하고 readback한다.
- source cleanup과 consumer lifecycle은 분리하고, 의도된 text·nested instance override는 보존한다.
- Figma만으로 keyboard, screen reader, 실제 hit area, runtime reflow 또는 WCAG 전체 준수를 선언하지 말고 runtime 검증 공백으로 기록한다.
- Dark, state, 또는 runtime 증거가 없으면 `통과`로 결론내리지 않는다.

공유된 authority가 충돌하거나 Figma 접근·필수 증거가 없으면 하나를 임의로 선택하지 말고 충돌 또는 검증 공백을 보고한다.

## 결과 형식

먼저 결론과 검사 범위를 적고, 발견사항은 아래 필드를 사용한다.

| 우선순위 | 판정 | node | 근거 | 기준 | 영향 | 최소 조치 | 남은 검증 |
| -------- | ---- | ---- | ---- | ---- | ---- | --------- | --------- |

마지막에 다음을 분리한다.

- 자동 확인 완료
- 자동 확인 가능·미실행
- 수동·runtime 확인 필요
- 수정 전 필요한 결정

문제가 없으면 검사한 node·mode·state와 검사하지 못한 범위를 함께 보고한다.
