## Context

이 기록은 PROD-588의 작성자 avatar 표시 계약, Profile이 소유하는 avatar Media 관계, 기존 게시글 presentation의 작성자·direct Source 소유 경계와 PR #435가 제공하는 공개 Profile avatar projection을 구현 입력으로 사용한다. 제품 동작은 delta specs에 두고 여기에는 구현 전 계속 지켜야 할 파생 계약과 dependency 선택만 기록한다.

## Decision Records

### 표시 위치가 소유한 Profile avatar를 우선 사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Status: Active
- Context / Problem: 일반 Post, Repost와 Quote는 직접 작성자와 direct Source 작성자가 서로 다를 수 있어 하나의 avatar 값을 presentation 전체에 재사용하면 잘못된 Profile 이미지를 표시한다.
- Decision Outcome: 각 작성자 표시 위치는 그 위치가 나타내는 Profile의 공개 Ready avatar URL을 우선 사용하고, 관계 또는 URL이 없을 때만 같은 Profile의 표시 이름·핸들 기반 이니셜 fallback을 사용한다.
- Alternatives Considered: 바깥 Post 작성자의 avatar를 Source에도 재사용하는 방식, 모든 위치에 이니셜만 유지하는 방식. 전자는 Profile 소유 관계를 위반하고 후자는 PROD-588의 전달 결과를 충족하지 않는다.
- Consequences: fragment와 presentation mapping은 outer 작성자와 direct Source 작성자의 avatar를 독립적으로 운반해야 한다.
- Confirmation / Follow-up: 일반 Post, 순수 Repost direct Source, Quote 직접 작성자와 direct Source, null avatar 상태를 서로 구분되는 fixture와 runtime으로 확인한다.

### 이미지 연결은 기존 presentation 계약을 바꾸지 않는다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-588](https://linear.app/byulmaru/issue/PROD-588)
- Status: Active
- Context / Problem: avatar 이미지 연결이 크기, 레이아웃, Profile 이동과 접근성 이름 변경으로 확장되면 기존 게시글 UI 계약과 별도 디자인 범위를 침범한다.
- Decision Outcome: 실제 이미지와 이니셜 fallback 모두 기존 목록 48px, 상세·Source preview 40px 크기, Profile Link, 접근성 label과 layout을 유지한다. 업로드·저장·Media 공개 정책, 공용 Avatar 재설계, 기본 asset과 네트워크 이미지 로드 실패 정책은 이 change에서 변경하지 않는다.
- Alternatives Considered: 이미지 상태에 맞춰 크기·layout을 재설계하거나 네트워크 오류 fallback까지 함께 추가하는 방식. 두 선택 모두 PROD-588의 제외 범위를 넓힌다.
- Consequences: 이번 change는 기존 Avatar props를 소비하는 leaf presentation과 그 검증만 수정한다.
- Confirmation / Follow-up: Storybook에서 이미지와 fallback의 크기·Profile 이동·접근성 이름이 동일하게 유지되는지 확인한다.

### PROD-492의 공개 projection을 leaf Relay fragment에서 소비한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588), [PROD-492](https://linear.app/byulmaru/issue/PROD-492)
- Status: Active
- Context / Problem: PROD-588이 필요한 `Profile.avatar { id url }`와 image-capable Avatar는 PROD-492가 제공하며 현재 게시글 fragment만 이 필드를 소비하지 않는다.
- Decision Outcome: PROD-492 결과를 선행 입력으로 사용하고 게시글을 실제 렌더링하는 leaf Relay fragment가 `avatar { id url }`을 조회해 기존 Avatar의 nullable image URI에 전달한다. PROD-588에서 같은 API·schema·Media projection이나 별도 primitive를 복제하지 않는다.
- Alternatives Considered: 상위 route query가 avatar scalar를 따로 조립하는 방식, PROD-588이 API·Avatar 구현을 복제하는 방식, PROD-492와 무관하게 main에서 독립 구현하는 방식. 각각 fragment colocation을 약화하거나 ownership 중복과 stack 충돌을 만든다.
- Consequences: PROD-588 PR은 PROD-492 결과가 먼저 포함되는 stack 순서를 유지하며 Relay compiler 산출물은 생성해 검증하되 commit하지 않는다.
- Confirmation / Follow-up: parent ancestry와 PR base를 확인하고 Relay compile·typecheck에서 leaf fragment와 schema 정합성을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
