# Review Style Memory

## Purpose

- kosmo PR을 리뷰하거나 기존 리뷰에서 컨벤션을 추출할 때 이 메모를 적용한다.
- 리뷰는 한국어로 작성한다.
- 자동 생성 PR 본문보다 사람이 직접 남긴 review comment, review summary, resolved thread를 더 신뢰한다.

## Review Posture

- 발견 사항은 사용자 영향, 런타임 동작, 캐시/스키마 계약, 보안/운영 실패 가능성 순으로 판단한다.
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

## Review Thread Policy

- 리뷰 thread는 수정했거나 확인만으로 충분해도 resolve한다.
- merge 전 unresolved review comment가 남아 있으면 안 된다.
- 다른 PR에 이미 같은 문제가 논의되었으면 해당 PR/comment를 링크해 같은 기준을 반복 적용한다.
- 자동화나 AI가 남긴 리뷰라도 의미 있는 지적이면 실제 코드 기준으로 다시 판단한다. 틀린 지적은 왜 틀렸는지 남기고 무시한다.

## Review Response

- 리뷰를 반영할 때는 코드 변경만 하지 말고 필요하면 OpenSpec, Storybook, memory도 함께 맞춘다.
- 리뷰가 PR 범위를 벗어나면 이 PR의 책임이 아니라고 정리하고 follow-up 위치를 남긴다.
- stacked PR에서 어느 PR이 책임지는 변경인지 분명히 한다.
- 다른 PR 위에 쌓이거나 다른 PR이 먼저 merge되어야 하면 의존 PR 번호를 명시한다.
