# Coding Style Memory

## Purpose

- kosmo에서 일반 구현, 설계, 리뷰 대응을 할 때 이 메모를 먼저 훑는다.
- 이 파일은 공통 규칙의 진입점이다. 작업 전에 [Core Principles](coding/principles.md)를 먼저 읽고, 작업 영역에 적용되는 아래 주제 문서를 선택해 처음부터 끝까지 읽는다.
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

- [Core Principles 전체 읽기](coding/principles.md)

## Tests

- [Tests 전체 읽기](coding/tests.md)

## API And Client Contracts

- [API And Client Contracts 전체 읽기](coding/api-contracts.md)

## Core Services

- [Core Services 전체 읽기](coding/core-services.md)

## Spec And Policy Sync

- [Spec And Policy Sync 전체 읽기](coding/spec-policy.md)

## Runtime And Tooling

- [Runtime And Tooling 전체 읽기](coding/runtime.md)
