# Review Style Memory

## Purpose

- kosmo PR을 리뷰하거나 기존 리뷰에서 컨벤션을 추출할 때 이 메모를 적용한다.
- 리뷰는 한국어로 작성한다.
- 자동 생성 PR 본문보다 사람이 직접 남긴 review comment, review summary, resolved thread를 더 신뢰한다.

## Review Posture

- 발견 사항은 사용자 영향, 런타임 동작, 캐시/스키마 계약, 보안/운영 실패 가능성 순으로 판단한다.
- OpenSpec change를 구현 완료한 PR은 `openspec/changes/<change>`가 archive되고 delta가 `openspec/specs/*` active spec에 반영됐는지 확인한다. 구현과 검증이 끝났는데 change가 active로 남아 active spec이 예전 계약을 유지하면 리뷰에서 막는다.
- 추측보다 재현 근거를 우선한다. 실제 로컬 실행, target runner 실행, Storybook 렌더링, 기기/시뮬레이터 동작 확인을 근거로 삼는다.
- 단순 취향보다 "왜 이 shape가 다음 변경에서 문제가 되는지"를 설명한다.
- 변경 이유가 불명확하면 먼저 "왜 바뀌었는지"를 묻는다.
- 플랫폼 제약이 의심되면 Windows symlink, Node version, runner capability, browser/runtime API 지원 여부를 확인한다.

## Comment Shape

- 가능한 한 정확한 파일/라인에 단다.
- 코멘트에는 다음 중 필요한 것을 포함한다.
  - 현재 코드가 만드는 동작
  - 실제 영향 또는 깨지는 workflow
  - 관찰한 재현 결과
  - 선호하는 수정 방향 또는 suggested change
  - 지금 PR에서 막아야 하는지, follow-up으로 둘 수 있는지
- actionable blocker와 non-blocking note를 구분한다.
- 후속 정책으로 미뤄도 되는 내용은 `TODO:` 주석, OpenSpec 남은 결정, 후속 PR/이슈로 남기도록 요구한다.

## Priority Labels

- `P1`: merge 전에 고쳐야 하는 동작/보안/캐시/API 계약 문제.
- `P2`: 지금 고치는 편이 좋지만, 범위와 위험에 따라 후속으로 분리할 수 있는 문제.
- `P3`: 설계 방향이나 미래 정책을 위해 짚는 낮은 우선순위 문제.
- `P5`: 사소한 일관성, 불필요한 변수/wrapper, 정리성 문제.
- priority를 붙이면 이유도 함께 적는다. 숫자만 남기지 않는다.

## Thread Handling

- 리뷰 thread 확인, 응답, resolve, merge 전 정리는 `memory/review-thread.md`를 따른다.
- 이 파일은 리뷰 코멘트 작성 스타일, priority label, 근거 제시 기준만 다룬다.
