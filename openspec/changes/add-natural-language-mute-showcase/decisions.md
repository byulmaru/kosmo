## Session Context

[PROD-1160](https://linear.app/byulmaru/issue/PROD-1160)과 `proposal.md`를 바탕으로 한 작업 메모다. 이 문서는 ADR이나 별도 승인 기록이 아니다.

## Choice Notes

### 소개 자료로 범위를 정리한다

- Date: 2026-10-19
- Upstream context: 현재 사용자 확인 “HTML이나 이미지 몇 장으로 소개하는 거면 됨”과 이를 반영한 PROD-1160 본문.
- Choice: HTML 목업 또는 이미지로 문장 입력 예시와 피드 가림 결과를 소개한다. 동작하는 체험 앱은 필수가 아니다.
- Reason: 방문자가 구상을 이해하면 이번 전달 목적을 충족한다.
- Alternatives: 실제 앱 내부 흐름, 독립 체험 앱과 Storybook 데모는 현재 필요하지 않다.
- Consequences: 새 앱 경로, 백엔드와 모델 연동 없이 소개 자료 제작과 시각 확인에 집중한다.

### HTML을 기본 제작안으로 제안한다

- Date: 2026-10-19
- Upstream context: 사용자가 HTML 또는 이미지를 허용했다.
- Choice: HTML 한 파일을 기본 제작 방향으로 제안한다. 장면 수와 파일 위치는 작업 중 조정할 수 있다.
- Reason: 예문과 피드 전·후를 함께 보여주고 수정하기 쉽다.
- Alternatives: 이미지 몇 장으로만 제공해도 된다.
- Consequences: HTML과 이미지 모두를 만들어야 한다는 완료 조건은 추가하지 않는다. 실제 모델·앱 기능을 구현하는 승인으로 해석하지 않는다.

## Unresolved Questions

- 없음.
