## Context

기존 원격 projection은 HTML 정규화 후 canonical document를 만들지만 Local 전용 500자 검사를 호출하지 않는다.
이번 change는 정규화된 결과에 원격 10,000자 기준을 적용한다. 기존 무제한 결정과 전체 resource budget 초안을 대체한다.

## Goals / Non-Goals

**Goals:** summary/body 합계 검사, 원자적 no-op, 원문 없는 관측, 정상 수신 회귀 보존.

**Non-Goals:** 파싱 전 byte·HTML 구조·JSON 크기·hydration 제한(PROD-931), Local 500자 변경, Quote materialization,
PROD-661 공통 projector 추출, 기존 데이터 재검사·삭제, 전역 OOM 방지.

## Implementation Guidance

### Current Constraints

조사 기준은 `main`의 `1bb02f04c9d46f8958c9ec845e04e139d9a6dad3`이다.
`packages/core/activitypub-note-content.ts`는 summary를 HTML에서 Plain Text로 정규화하고 body를 canonicalize한다.
`packages/core/post-content/server.ts`의 body Plain Text 변환은 paragraph 사이 줄바꿈과 hard break를 포함하고 Media를 제외한다.
`packages/fedify/src/inbound-create-note.ts`는 content projection 이후 Media projection과 저장을 진행한다.
기존 LOCAL validator에는 빈 본문·Media 검사도 있으므로 원격 검증에 그대로 사용하면 안 된다.

### Recommended Approach

canonical projection 직후 `(summary ?? '').length + bodyPlainText.length`를 10,000과 비교한다.
기존 Plain Text 변환을 재사용하며 추가 Unicode 정규화, grapheme 계산, 표시용 summary 구분자 삽입은 하지 않는다.
Media projection·새 Media 생성·저장 transaction 전에 길이 실패를 확정한다. Media와 Alt Text는 합계에 들어가지 않는다.

원격 길이 초과만 식별하는 전용 오류를 두고 inbound handler에서 고정 reason으로 거부한다.
예상하지 못한 TypeError/RangeError를 길이 초과로 묶지 않는다. 기존 저장 원자성과 post-commit effect 경계를 유지한다.
metric과 구조화 로그는 원문 없이 제한 종류를 구분하고 기존 관측 경로에서 중복 보고를 피한다.

### Allowed Alternatives

동일한 canonical 계산과 모든 production consumer의 검증을 보장한다면 helper 위치와 오류 표현은 조정할 수 있다.
로컬 validator 호출, raw HTML 길이 검사로 대체, 잘라 저장하기는 허용하지 않는다.

### Known Traps

500개의 surrogate pair는 UTF-16 1,000 단위다. summary와 body 사이에 표시 구분자를 더하지 않는다.
HTML markup·hidden content는 기존 정규화 결과에 따라 제외되지만 파싱 비용 자체는 여전히 발생한다.
IRI hydration 후 길이 검사를 통과해도 응답을 읽는 동안의 할당은 보호되지 않는다.

## Decisions

D1/D2/D3의 현재 계약을 적용한다. 입력·구조·응답의 한도 수치나 loader 구현은 PROD-931의 후속 결정이며
현재 명세의 구현을 막는 미결정이 아니다. PROD-509는 10,000자 거부 계약만 재사용한다.

## Risks / Trade-offs

큰 HTML·href·JSON 또는 hydration 응답이 파싱 자원을 소비할 수 있다. 이 change 완료를 최초 security finding 전체의
해결로 취급하지 않는다. PROD-931은 Fedify의 해결 여부를 재확인하고 업데이트 또는 upstream 기여를 우선 검토한다.

## Migration Plan

새 수신에 적용하며 저장된 Post와 revision은 재검사하거나 삭제하지 않는다. DB migration과 공개 API 변경은 없다.
배포 후 거부 metric과 정상 수신 회귀를 확인한다. rollback은 길이 검사의 코드 변경을 되돌리며 저장 데이터 변환은 필요 없다.

## Open Questions

현재 범위에 남은 미결정은 없다. 명세 전체의 최종 Spec Gate는 2026-09-10 사용자 승인으로 완료됐다.
