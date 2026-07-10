# Coding Style Memory

## Purpose

- kosmo에서 일반 구현, 설계, 리뷰 대응을 할 때 이 메모를 먼저 훑는다.
- 이 메모는 PR 본문이 아니라 다른 사람 PR에 `robin-maki`가 직접 남긴 리뷰에서 반복된 기준을 일반화한 것이다.
- 세부 영역은 기존 메모를 우선한다.
  - GraphQL resolver/API 세부 구조: `memory/graphql-style.md`
  - Expo Router/React Native Web/React Relay/Storybook: `memory/frontend-react-native.md`
  - DB/Drizzle schema: `memory/database-design.md`
  - 스크립트/CI/명령 실행: `memory/script.md`
  - 커밋/PR/스택 운영: `memory/commit-pr.md`를 먼저 읽고, 작업 상황에 맞는 하위 메모리를 추가로 읽는다.
  - 리뷰 작성 스타일: `memory/review-style.md`
  - 리뷰 thread 운영: `memory/review-thread.md`

## Core Principles

- 코드는 도메인 소유 관계, 클라이언트 캐시 모델, 실제 사용자 workflow, OpenSpec을 동시에 만족해야 한다.
- 새 API나 컴포넌트 shape는 "구현하기 쉬운 위치"보다 "데이터를 소유하고 갱신하는 위치"를 기준으로 둔다.
- DB나 백엔드에 값이 있다는 이유만으로 프론트/API에 노출하지 않는다. 노출 필드는 실제 사용 사례와 갱신/캐시 의미가 있어야 한다.
- 임시 leaf 처리보다 경계(boundary)를 고친다. 예를 들어 프로필 표시용 handle은 `Profile.relativeHandle` API 계약으로 전달하고, GraphQL data shape와 확정된 error 표시 정책은 컴포넌트마다 patch하지 말고 API 또는 공통 formatting/error boundary에서 정한다.
- 타입은 실제 런타임 분기와 맞춘다. link/static처럼 렌더링 element가 달라지면 discriminated union 등으로 attribute 타입도 분기한다.
- 불필요한 abstraction, wrapper, reactive alias를 만들지 않는다. 실제 책임 분리나 reactive dependency가 있을 때만 분리한다.
- 구조적으로 재사용될 책임이나 경계가 없다면 한 번만 쓰이는 값, helper, component, wrapper는 추출하지 말고 호출 위치에 인라인한다.
- 도메인/모듈 경계상 추후 재사용 가능성이 분명하면 미리 이름을 줄 수 있지만, "언젠가 쓸 수도 있음"만으로 one-off 코드를 분리하지 않는다.
- 미래 정책을 미리 조금 구현해야 한다면 현재 도달 가능한 상태와 미래 상태를 분리해 `TODO:` 또는 후속 이슈로 남긴다.
- "돌아갈 것 같다"를 근거로 삼지 않는다. 실행 스크립트, CI runner, Storybook, platform-specific 동작은 실제 target workflow에서 확인한다.

## API And Client Contracts

- GraphQL schema는 normalized cache가 자연스럽게 갱신될 수 있게 object 소유 관계를 기준으로 둔다.
- top-level query보다 object field가 더 맞는 경우가 많다. 예를 들어 account가 소유한 profile 목록은 `Account.profiles`처럼 계정 object를 타게 한다.
- 관계 상태만 scalar로 노출하기보다, 메타데이터와 캐시 갱신이 필요하면 관계 object를 노출한다.
- 삭제/해제 mutation은 클라이언트가 cache에서 제거할 정확한 대상 ID를 반환한다.
- 상태가 있는 관계 mutation은 기존 row를 state 필터 없이 먼저 조회한 뒤 state별 정책으로 분기한다.
- create input은 최소화하고 서버에서 명확한 기본값을 채운다.
- update input은 omitted과 `null`의 의미를 명확히 분리한다. 생략은 보통 변경 없음이고, nullable 도메인 필드의 `null`은 명시적 clear가 될 수 있다. non-null 도메인 필드는 update input에서 optional로 받더라도 `null`을 새 값으로 보지 않는다.
- backend error `message`를 UI에 어떻게 노출할지는 아직 정책이 완전히 정해지지 않은 영역이다. 메시지를 그대로 쓰는 코드만으로 확정 위반으로 단정하지 말고, 필요한 경우 error type/code 기반 분기, generic localized fallback, 원문 노출 허용 범위 중 무엇이 정책인지 먼저 정리한다.

## Spec And Policy Sync

- OpenSpec과 구현은 root field, object field, payload, error type, connection, UI 수치 단위가 서로 맞아야 한다.
- 코드가 spec과 다르면 어느 쪽이 source of truth인지 정하고 같은 PR에서 정렬한다.
- 현재 범위에서 의도적으로 미룬 정책은 코드 주석이나 OpenSpec의 decision artifact(`decisions.md`가 있으면 그 파일, 없으면 `design.md` 또는 관련 artifact)의 남은 결정으로 검색 가능하게 남긴다.
- 장기적으로 유지될 규칙은 task-specific skill보다 `memory/`에 남긴다.

## Runtime And Tooling

- dependency, runtime API, CI command, platform workaround를 바꿀 때는 왜 바뀌는지와 target runtime/platform 제약을 확인한다.
- Node/Web/OS별 API 지원 여부를 확인하지 않고 polyfill이나 대체 구현으로 바꾸지 않는다.
- CI/security scanner는 실패를 성공으로 삼키지 않는다. `continue-on-error`를 쓰면 후속 step에서 실패 여부를 판정해야 한다.
- runner 변경은 실제 target runner에서 실행해 확인한다.
