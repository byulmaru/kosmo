---
name: kosmo-design-audit
description: Use when reviewing or auditing KOSMO Figma components, screens, foundations, tokens, variants, states, accessibility, Light/Dark behavior, responsive layouts, or design-system drift before a Figma edit, redesign, handoff, or source-component cleanup; not for implementing or reviewing production UI code.
---

# KOSMO Design Audit

설치된 `figma:figma-use`로 Figma 구조를 읽고, KOSMO 디자인 시스템의 누락과 드리프트를 근거 중심으로 감사한다. 감사와 수정은 분리하며 source component의 문제를 consumer override로 가리지 않는다.

## 적용 범위

- Figma 감사·수정에만 사용한다. 대상은 source component, variable, style이며 수정은 승인 후에만 수행한다.
- production React Native·Web 컴포넌트 구현이나 코드 리뷰에는 사용하지 않는다. 코드와 문서는 Figma 계약을 확인하는 근거로만 읽는다.

## 기준 선택

- 컴포넌트의 제품 동작·구성·시각적 의도는 이번 Figma 감사·수정에서 사용자가 승인한 대상별 계약을 우선한다.
- foundation token 값은 현재 기준 브랜치에 머지된 `docs/design/*.md`와 canonical token 정의를 우선한다.
- 사용자가 미병합 PR·제안을 명시적으로 선택하면 해당 작업에서만 `후보 계약`으로 사용하고, 현재 계약·후보 계약·Figma 상태를 분리해 보고한다.
- 현재 Figma source, variable, style은 감사 대상이자 증거다. canonical foundation과 충돌하면 Figma 값을 authority로 삼지 않고 드리프트로 보고한다.
- [audit-rules.md](references/audit-rules.md)의 일반 규칙과 시각적 취향은 위 계약을 덮어쓰지 않는다.

공유된 authority끼리 충돌하면 조용히 하나를 선택하지 말고 충돌과 필요한 결정을 보고한다.

## 감사 절차

1. 정확한 Figma 파일, node ID, source/instance 여부, 대상 플랫폼과 확인할 상태를 정한다.
2. foundation을 검사하면 기준 브랜치와 canonical source revision을 먼저 확인한다. 현재 worktree 문서를 머지된 계약으로 가정하지 말고, `docs/design/README.md`가 연결하는 공통 문서와 대상 컴포넌트 문서만 읽는다.
3. 모든 `use_figma` 호출 전에 `figma:figma-use`를 로드한다. 감사 단계에서는 읽기 전용 JavaScript만 실행한다.
4. [figma-inspection.md](references/figma-inspection.md)에 따라 구조·binding·variant 증거를 수집한다. screenshot은 시각 증거, variable 정의는 token 증거로 따로 다룬다.
5. [audit-rules.md](references/audit-rules.md)를 적용해 `확정`, `위험`, `검증 공백`으로 분류한다.
6. 문제를 숨기는 instance override가 아니라 source에서 고칠 최소 범위를 제안한다.

사용자가 제공한 증거만 사용하도록 제한했거나 Figma 접근이 없으면 도구 호출을 생략한다. 제공 증거로 확정 가능한 항목과 최소 증거 누락을 분리한다.

## 수정 경계

- 감사 중에는 Figma를 변경하지 않는다. 사용자가 처음부터 수정을 요청해도 먼저 감사 결과와 정확한 node·값·영향 범위를 보여주고 승인을 기다린다.
- 승인 후에만 `figma:figma-use`와 필요한 Figma 생성 스킬로 source를 작은 단위로 수정하고 readback한다.
- source와 consumer lifecycle을 한 변경에 섞지 않는다. 텍스트 등 의도된 instance override는 보존한다.
- Dark, state, runtime 증거가 없으면 `통과`로 결론내리지 않는다.
- Figma만으로 keyboard, screen reader, 실제 hit area, runtime reflow 또는 WCAG 전체 준수를 주장하지 않는다.

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
