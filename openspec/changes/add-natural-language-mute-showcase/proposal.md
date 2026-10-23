## Why

코미버스 행사 방문자가 자연어 뮤트의 구상과 사용 흐름을 이해할 수 있도록 소개 자료를 준비한다. 실제 모델을 연결하기 전에, 보고 싶지 않은 내용을 문장으로 표현하면 피드가 어떻게 보일지 보여주는 것이 목적이다.

## Goal

HTML 목업 또는 몇 장의 이미지에서 문장 입력 예시, 적용된 조건, 예시 피드의 가림 결과를 이어서 소개한다.

## What Changes

- 행사에서 설명할 자연어 뮤트 구상을 시각 자료로 만든다.
- 문장과 가려지는 글의 관계를 같은 시나리오 안에서 보여준다.
- 내부 모델 이름을 몰라도 기능의 의도를 이해할 수 있는 한국어 안내를 둔다.

## Non-Goals

- 실제 Jev/Decision model 연동, 학습, 추론과 성능 검증.
- 백엔드, 운영 데이터, 계정 설정과 기존 앱 경로 연결.
- 실제 서비스의 뮤트 정책 변경과 프로덕션 배포.
- 자유 입력을 처리하는 체험 앱, 새 API와 범용 시연 도구 제작.

## Constraints

- 2026-10-19 사용자의 “HTML이나 이미지 몇 장으로 소개하는 거면 됨”을 현재 범위로 따른다. 동작하는 입력·적용 기능은 완료 조건이 아니다.
- 데이터와 가림 결과는 준비한 예시다. 이를 실제 모델의 판단, 정확도나 현재 서비스 기능의 증거로 제시하지 않는다.
- 기존 Word Mute Rule, Hashtag Mute Rule과 Profile Mute의 제품 정책을 바꾸지 않는다.

## Verification

완성된 자료를 열어 문장 입력 예시와 가림 결과의 관계를 확인할 수 있는지 살핀다. 예시의 의미와 가려지는 글이 맞는지, 한글·설명·피드가 잘리지 않는지 직접 확인한다. 구체적인 화면 구성과 점검은 `design.md`, `tasks.md`에 정리한다.

이번 Spec 세션의 검증은 계획 문서의 구조와 계약 대조까지다. 목업 제작과 렌더링 검증은 다음 Implement 세션에서 수행한다.

## Business Context

- Product canonical: `docs/domain/objects/word-mute-rule.md`, `docs/domain/objects/hashtag-mute-rule.md`, `docs/domain/objects/profile-mute.md`. 기존 정책을 유지하는 경계를 확인하기 위한 자료이며 자연어 모델의 동작을 정의하지 않는다.
- Visual design source: `docs/design/README.md`, `docs/design/colors.md`, `docs/design/foundations.md`, `docs/design/typography.md`, `docs/design/accessibility.md`. 시각 구조·상태 표현·가독성에만 적용한다.
- Linear: [PROD-1160](https://linear.app/byulmaru/issue/PROD-1160). 사용자 확인에 맞춰 범위와 완료 기준을 갱신했다.
- User agreement: 2026-10-19 Spec Workflow 요청과 “HTML이나 이미지 몇 장으로 소개하는 거면 됨”이라는 범위 확인.

## Session Status

- Status: Active
- Last updated: 2026-10-19
- 소개 자료 제작과 직접 시각 확인을 마쳤으며 자동 검증은 GitHub CI에 인계한다. 이 문서는 현재 세션의 작업 메모이며 제품 계약이나 추가 승인 문서가 아니다.
