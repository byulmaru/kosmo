# Review Thread Memory

## Purpose

- PR review thread를 확인, 응답, resolve, merge 전 정리할 때 적용한다.
- 리뷰 코멘트를 작성하는 업무라면 `memory/review-style.md`도 함께 읽는다.

## Review Thread Policy

- merge 전에는 unresolved review thread가 남아 있지 않아야 한다.
- 리뷰 코멘트는 코드를 수정했을 때뿐 아니라 확인만으로 충분한 경우에도 resolve한다.
- 같은 문제가 다른 PR에서 이미 논의됐으면 해당 PR/comment를 링크해 같은 기준을 반복 적용한다.
- 자동화나 AI가 남긴 리뷰라도 의미 있는 지적이면 실제 코드 기준으로 판단하고, 틀린 지적은 왜 틀렸는지 남긴 뒤 무시한다.

## Response Policy

- 리뷰를 반영할 때는 코드 변경만 하지 말고 필요하면 OpenSpec, Storybook, memory도 함께 맞춘다.
- 리뷰가 PR 범위를 벗어나면 이 PR의 책임이 아니라고 정리하고 follow-up 위치를 남긴다.
- stacked PR에서 어느 PR이 책임지는 변경인지 분명히 한다.
- 다른 PR 위에 쌓이거나 다른 PR이 먼저 merge되어야 하면 의존 PR 번호를 명시한다.
