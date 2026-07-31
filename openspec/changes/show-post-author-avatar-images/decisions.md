## Context

이 기록은 PROD-588의 앱 공용 Profile avatar/header 표시 계약과 PROD-492가 제공하는 공개 Profile image projection을 구현 입력으로 사용한다. 제품 동작은 delta specs에 두고 여기에는 구현 전 계속 지켜야 할 파생 계약과 dependency 선택만 기록한다.

## Decision Records

### 각 표시 위치는 자신이 나타내는 Profile 이미지를 소유한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Status: Active
- Context / Problem: Repost·Quote의 작성자와 Source, Profile 목록의 여러 행, selected Profile과 Notification Related Profile은 서로 다를 수 있어 하나의 image URL을 presentation 전체에 재사용하면 잘못된 Profile 이미지를 표시한다.
- Decision Outcome: 각 avatar/header 표시 위치는 그 위치가 나타내는 Profile의 공개 Ready URL을 우선 사용하고, 관계 또는 URL이 없을 때만 같은 Profile의 기존 이니셜 또는 gradient fallback을 사용한다.
- Alternatives Considered: 상위 화면이 하나의 URL을 모든 하위 표면에 전달하는 방식, 모든 위치에 이니셜·gradient만 유지하는 방식. 전자는 Profile 소유 관계를 위반하고 후자는 PROD-588의 전달 결과를 충족하지 않는다.
- Consequences: leaf fragment와 presentation mapping은 각 Profile의 image 관계를 독립적으로 운반해야 한다.
- Confirmation / Follow-up: 게시글 작성자·Source, ProfileSwitcher 활성·목록 Profile, 공용 ProfileListItem, 하단 탭·작성기, Notification Related Profile과 null 상태를 서로 구분되는 fixture와 runtime으로 확인한다.

### 이미지 연결은 기존 presentation과 actor 전환 계약을 바꾸지 않는다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Status: Active
- Context / Problem: 이미지 연결이 크기, 레이아웃, Profile 이동, 접근성 이름이나 selected Profile 전환 변경으로 확장되면 기존 UI·상태 계약과 별도 디자인 범위를 침범한다.
- Decision Outcome: 실제 이미지와 fallback 모두 각 소비자의 기존 크기, Profile Link, 접근성 label과 layout을 유지한다. ProfileSwitcher의 mutation, Relay store 갱신과 actor별 Environment 재생성도 유지한다. 업로드·저장·Media 공개 정책, 기본 asset과 네트워크 이미지 로드 실패 정책은 변경하지 않는다.
- Alternatives Considered: 이미지 상태에 맞춰 layout을 재설계하거나 ProfileSwitcher의 상태 흐름을 함께 재구성하는 방식. 두 선택 모두 PROD-588의 제외 범위를 넓힌다.
- Consequences: 이번 change는 기존 image props를 소비하는 leaf presentation과 그 검증만 수정한다.
- Confirmation / Follow-up: 기존 Storybook interaction을 유지하며 이미지와 fallback의 크기·이동·접근성·Profile 전환 동작을 확인한다.

### PROD-492 projection을 leaf Relay fragment에서 소비한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588), [PROD-492](https://linear.app/byulmaru/issue/PROD-492)
- Status: Active
- Context / Problem: PROD-588이 필요한 Profile avatar/header URL과 image-capable Avatar는 PROD-492가 제공하며 현재 production consumer fragment만 이 필드를 완전히 소비하지 않는다.
- Decision Outcome: PROD-492 결과를 선행 입력으로 사용하고 실제 Profile 이미지를 렌더링하는 leaf Relay fragment가 `avatar { id url }`과 필요한 경우에만 `header { id url }`을 조회한다. PROD-588에서 같은 API·schema·Media projection을 복제하지 않는다.
- Alternatives Considered: 상위 route query가 image scalar를 따로 조립하는 방식, PROD-588이 API·Avatar 구현을 복제하는 방식. 각각 fragment colocation을 약화하거나 ownership 중복과 stack 충돌을 만든다.
- Consequences: Relay compiler 산출물은 생성해 검증하되 commit하지 않고, PROD-588 PR은 PROD-492 결과가 포함되는 stack 순서를 유지한다.
- Confirmation / Follow-up: parent ancestry와 PR base를 확인하고 Relay compile·typecheck에서 leaf fragment와 schema 정합성을 검증한다.

### 공용 Avatar는 재사용하고 header는 기존 cover에서 직접 표시한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-588](https://linear.app/byulmaru/issue/PROD-588), [PROD-492](https://linear.app/byulmaru/issue/PROD-492)
- Status: Active
- Context / Problem: avatar는 이미 nullable `imageUri`와 이니셜 fallback을 지원하지만 header는 원형 avatar primitive의 역할이 아니며 기존 ProfileSwitcher cover geometry와 gradient fallback을 가진다.
- Decision Outcome: avatar 소비자는 기존 `Avatar.imageUri`만 사용한다. ProfileSwitcher header는 기존 cover 영역에 조건부 React Native `Image`를 표시하고 URL이 없으면 현재 gradient를 유지한다. data-aware Avatar나 새 header primitive를 만들지 않는다.
- Alternatives Considered: Avatar가 Relay fragment를 직접 소유하게 하는 방식, header까지 Avatar로 표현하는 방식, 새 공용 header primitive를 만드는 방식. 모두 현재 변경에 불필요한 추상화 또는 역할 혼합을 만든다.
- Consequences: image data ownership은 leaf consumer에 남고 primitive API와 header layout은 변하지 않는다.
- Confirmation / Follow-up: Shell Storybook에서 full·drawer·compact avatar와 실제 header·gradient fallback을 함께 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
