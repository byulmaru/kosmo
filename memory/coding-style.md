# Coding Style Memory

## Purpose

- kosmo에서 일반 구현, 설계, 리뷰 대응을 할 때 이 메모를 먼저 훑는다. 이 파일은 공통 규칙의 짧은 라우터이며, 현재 작업에 직접 적용되는 주제만 선택한다.
- [GPT-6 Astra를 위한 skills와 prompts 재검토](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)의 task-specific routing과 progressive disclosure를 따른다. 선택한 주제 파일은 처음부터 끝까지 읽되, 관련 없는 주제나 전체 저장소를 기본으로 읽지 않는다.
- 이 메모는 PR 본문이 아니라 다른 사람 PR에 `robin-maki`가 직접 남긴 리뷰에서 반복된 기준을 일반화한 것이다.
  - GraphQL resolver/API: `memory/graphql-style.md` 진입점과 선택한 세부 문서
  - Temporal Workflow/Activity와 post-commit start: `memory/temporal-workflows.md` 진입점과 선택한 세부 문서
  - Expo Router/React Native Web/React Relay/Storybook: `memory/frontend-react-native.md` 진입점과 선택한 세부 문서
  - DB/Drizzle schema: `memory/database-design.md`와 `memory/database-migrations.md` 진입점, 선택한 세부 문서
  - 스크립트/CI/명령 실행: `memory/script.md` 진입점과 선택한 세부 문서
  - 커밋/PR/스택 운영: `memory/commit-pr.md`를 먼저 읽고, 작업 상황에 맞는 하위 메모리를 추가로 읽는다.
  - 리뷰 작성 스타일: `memory/review-style.md` 진입점과 선택한 `memory/review/` 주제 문서
  - 리뷰 thread 운영: `memory/review-thread.md`

## Core Principles

- 코드 소유권, 공개 계약, 데이터·캐시 shape 또는 구현 경계를 바꾸는 작업에 적용한다: [Core Principles](coding/principles.md)를 전체 읽기.

## Tests

- 실행 동작이나 검증을 바꾸는 작업에 적용한다: [Tests](coding/tests.md)를 전체 읽기.

## API And Client Contracts

- API, GraphQL, client cache 또는 공개 payload를 바꾸는 작업에 적용한다: [API And Client Contracts](coding/api-contracts.md)를 전체 읽기.

## Core Services

- 여러 진입점이 공유하는 domain action 또는 service 경계를 바꾸는 작업에 적용한다: [Core Services](coding/core-services.md)를 전체 읽기.

## Spec And Policy Sync

- OpenSpec, canonical 문서 또는 durable policy와 구현을 함께 바꾸는 작업에 적용한다: [Spec And Policy Sync](coding/spec-policy.md)를 전체 읽기.

## Runtime And Tooling

- dependency, runtime, CI, platform 또는 실행 명령을 바꾸는 작업에 적용한다: [Runtime And Tooling](coding/runtime.md)를 전체 읽기.
