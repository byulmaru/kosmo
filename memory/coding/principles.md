# Coding Style: Core Principles

## Core Principles

- 코드는 도메인 소유 관계, 클라이언트 캐시 모델, 실제 사용자 workflow, OpenSpec을 동시에 만족해야 한다.
- 새 API나 컴포넌트 shape는 "구현하기 쉬운 위치"보다 "데이터를 소유하고 갱신하는 위치"를 기준으로 둔다.
- DB나 백엔드에 값이 있다는 이유만으로 프론트/API에 노출하지 않는다. 노출 필드는 실제 사용 사례와 갱신/캐시 의미가 있어야 한다.
- 임시 leaf 처리보다 경계(boundary)를 고친다. 예를 들어 프로필 표시용 handle은 `Profile.relativeHandle` API 계약으로 전달하고, GraphQL data shape와 확정된 error 표시 정책은 컴포넌트마다 patch하지 말고 API 또는 공통 formatting/error boundary에서 정한다.
- 타입은 실제 런타임 분기와 맞춘다. link/static처럼 렌더링 element가 달라지면 discriminated union 등으로 attribute 타입도 분기한다.
- 불필요한 abstraction, wrapper, reactive alias를 만들지 않는다. 실제 책임 분리나 reactive dependency가 있을 때만 분리한다.
- 구조적으로 재사용될 책임이나 경계가 없다면 한 번만 쓰이는 값, helper, component, wrapper는 추출하지 말고 호출 위치에 인라인한다.
- 도메인/모듈 경계상 추후 재사용 가능성이 분명하면 미리 이름을 줄 수 있지만, "언젠가 쓸 수도 있음"만으로 one-off 코드를 분리하지 않는다.
- 새 state/API/helper는 실제 호출 경로와 기존 책임 소유자, SDK/프레임워크 수명주기를 확인한 뒤 필요한 경우에만 추가하고 표준 수단을 우선 사용한다. 현재 요구나 실패 근거 없이 retry/quarantine/recovery 상태 기계를 선제 도입하지 않되 필요한 실패·재시도 계약은 유지한다.
- 미래 정책을 미리 조금 구현해야 한다면 현재 도달 가능한 상태와 미래 상태를 분리해 `TODO:` 또는 후속 이슈로 남긴다.
- "돌아갈 것 같다"를 근거로 삼지 않는다. 실행 스크립트, CI runner, Storybook, platform-specific 동작은 실제 target workflow에서 확인한다.
