## Context

PROD-509 범위를 현재 canonical·Linear 계약에서 파생한다. 아래 Active 상태는 설계 기록 상태이며 인간의 OpenSpec Gate 승인을 대신하지 않는다.

## Decision Records

### D1. 전달 Actor와 작성자 identity를 구분한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-509 목적·identity/attribution 완료 기준, 2026-09-09 사용자 확정
- Status: Active
- Context / Problem: Create는 전달 Actor와 작성자가 같은 기존 조건을 갖지만 원문 조회는 다른 Actor가 전달할 수 있다.
- Decision Outcome: 신규 경계는 요청 IRI와 Note ID, 단일 attribution 및 실제 저장할 Actor의 exact URI 일치를 Actor persistence 전에 검증한다. 기존 Create의 actor 일치 검증은 유지한다.
- Alternatives Considered: 전달 Actor를 작성자로 사용하거나 Create attribution을 완화하는 방식은 계약에 맞지 않는다.
- Consequences: protocol 검증은 Fedify 경계에 남고 core에는 canonical 입력만 전달한다.
- Confirmation / Follow-up: same/different actor 성공 경로와 identity mismatch·기존 Create 거절을 검증한다.

### D2. 일반 projection과 Post 저장을 재사용한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/architecture/core-services.md`, PROD-509 최소 helper 흡수 결정·제외 범위, 2026-09-09 사용자 확정
- Status: Active
- Context / Problem: 후속 consumer마다 일반 Note 변환이나 Post 저장이 중복될 수 있다.
- Decision Outcome: 기존 `projectRemoteNoteContent`, `projectRemoteNoteMedia`, Actor 정책 및 core `createPost`를 조합한다. audience 분류와 `inReplyTo` 해석·Parent lookup/fallback 중 실제로 필요한 최소 helper만 추출한다. 새 generic fetcher·loader wrapper·hydration abstraction·Post 저장 엔진을 만들지 않는다.
- Alternatives Considered: 기존 Create 전체를 새 원문 consumer로 그대로 호출하면 inbox 정책이 섞인다. 전체 Note projector와 두 단계 projection API는 기존 helper를 불필요하게 감싸므로 추가하지 않는다.
- Consequences: 구체 함수와 파일 배치는 구현에서 정하되 caller callback/evaluator로 검증을 위임하지 않는다.
- Confirmation / Follow-up: production 경계 직접 검증, Create 회귀와 core 타입 의존성을 확인한다.

### D3. object URI의 최초 저장과 post-commit 경계를 보존한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-509 원자성·중복 완료 기준
- Status: Active
- Context / Problem: 작성자 저장과 Post 생성의 조합은 기존 transaction과 effects 시작 순서를 바꿀 수 있다.
- Decision Outcome: unique object URI와 기존 Post 저장 경로를 사용하고 duplicate는 content·작성자·visibility·timestamp·Tombstone을 바꾸지 않는다. effects는 성공한 Post commit 뒤 실행하고 rollback/duplicate 시도에서는 시작하지 않는다.
- Alternatives Considered: upsert로 기존 content를 갱신하거나 중복 Create로 Tombstone을 복구하는 방식은 채택하지 않는다.
- Consequences: Actor/Post는 독립 transaction을 유지하며 전체 합류는 범위 밖이다. effects 실패를 이유로 committed Post를 되돌리지 않는다.
- Confirmation / Follow-up: 실제 DB의 동시 최초 저장·강제 실패와 effects 시작 순서를 검증한다.

### D4. 선행 budget을 완료 조건으로 유지한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, PROD-509 resource budget 선행 조건, PROD-465 포함 범위·완료 기준
- Status: Active
- Context / Problem: 최신 PROD-465는 정규화한 summary/body Plain Text 합계 10,000자(UTF-16 `.length`) 수신 한계를 소유한다.
- Decision Outcome: PROD-465의 10,000자 수신 한계와 초과 전체 no-op을 적용한다. 추가 원문 바이트·HTML 구조·canonical JSON·hydration 응답 보호는 PROD-931에 남긴다. 509에서 수치나 우회 loader를 따로 만들지 않는다.
- Alternatives Considered: 로컬 500자 정책을 대입하거나 10,000자 제한을 전체 자원 보호로 해석하지 않는다.
- Consequences: PROD-931은 관련 후속 범위이며 신규 blocker로 만들지 않는다. 선행 기능 자체는 509 tasks에 다시 넣지 않는다.
- Confirmation / Follow-up: embedded/IRI, 경계 바로 아래·정확한 경계·초과의 저장/no-op을 확인한다.

### D5. 스펙 준비와 구현 스택 연결을 분리한다

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/git-pr-workflow.md`, `memory/git-stack-maintenance.md`, PROD-509의 PROD-465 선행 관계, 사용자 결정(2026-09-09)
- Status: Active
- Context / Problem: 직전 부모는 구현 시 PROD-465 결과가 포함된 최신 스택 상태로 확인해야 한다.
- Decision Outcome: 스펙은 main 기준 PROD-509에 준비하고, 구현 때 PROD-465 결과를 포함하는 최상단 부모로 연결한다.
- Alternatives Considered: 존재하지 않는 부모를 추정하거나 필수 선행 결과를 빠뜨린 채 준비 완료로 표시하지 않는다.
- Consequences: 현재 local one-layer Stack은 구현 PR의 최종 구조를 나타내지 않는다. 구현 세션이 ancestry·부모 SHA·local/remote Stack을 재검증한다.
- Confirmation / Follow-up: 공식 gh-stack 경로와 실제 PR head/base/stack을 확인한다.

### D6. Reply 최초 저장과 후속 관계 복구를 분리한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`의 원격 Note 최초 materialization, PROD-509·PROD-506, 2026-09-09 사용자 확정
- Status: Active
- Context / Problem: 미저장 Quote Source 자체가 Reply일 수 있으며 Parent의 가용성과 Source identity는 독립적이다.
- Decision Outcome: 검증된 PUBLIC/UNLISTED Note는 Reply 여부와 관계없이 최초 저장한다. Parent는 DB identity lookup만 사용하고 미해석·부재·기존 계약상 부적합 시에만 null fallback한다. DB 장애와 예상하지 못한 오류는 전파한다. Source 자신의 identity·author·audience를 사용하며 Parent로 대체하지 않는다.
- Alternatives Considered: non-Reply 제한 유지, Parent fetch·재귀 materialization, 모든 오류의 null fallback, Parent 작성자 대체는 채택하지 않는다.
- Consequences: 기존 null Parent는 duplicate로 갱신하지 않는다. raw `inReplyTo` 미보존으로 자동 복구를 보장할 수 없으며 PROD-506이 대상 식별·재검증·update/backfill을 소유한다. 이 공백은 509 완료를 막지 않는다. Followers Only/DIRECT 신규 범위는 그대로다.
- Confirmation / Follow-up: 저장된 Local/Remote Parent·미해석·부적합·DB 장애·경합·duplicate와 Reply Source 자신의 identity를 검증한다.

### D7. 신규 원문도 기존 Media 계약을 재사용한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`의 원격 원문 Media·작성자 저장 경계, `docs/domain/objects/media.md`, PROD-509 및 사용자 Media 확정
- Status: Active
- Context / Problem: 신규 fetch 경로에 별도 Media 정책을 둘 필요가 있는지 미결정이었다.
- Decision Outcome: 기존 content/media helper와 `createPost`를 재사용한다. 앞 4개 지원 embedded 이미지, IRI-only·비지원·초과분 무시, 추가 fetch 없음, 선택 후보 검증 실패 시 전체 Note 거부를 유지한다. attachment-only는 허용하고 본문과 유효 이미지가 모두 없는 신규 Note는 거부한다. content/media 검증은 신규 author persistence보다 먼저 수행한다.
- Alternatives Considered: Media 제외, 부적합 이미지 일부 제거 후 저장, attachment 원격 fetch는 채택하지 않는다.
- Consequences: 기존 Create의 Media 및 empty 처리, nullable metadata·attachment별 identity를 변경하지 않는다. 신규 contentless 제외는 content와 media를 함께 판정한다.
- Confirmation / Follow-up: 지원/비지원/IRI-only·4개·검증 실패·attachment-only·완전 empty 및 author persistence 미시작을 검증한다.

### D8. Actor와 Post의 독립 commit을 유지한다

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`의 원격 원문 Media·작성자 저장 경계, `docs/architecture/core-services.md`, PROD-509 및 사용자 저장 경계 확정
- Status: Active
- Context / Problem: 유효한 Actor 저장 뒤 Post 실패·duplicate에서 작성자까지 rollback할지 미결정이었다.
- Decision Outcome: Actor/Profile 내부 원자성과 Post 내부 원자성을 각각 유지한다. Post·Content·currentContent·mapping·첨부 Media·최초 Reply Parent는 기존 `createPost` transaction에서 commit/rollback한다. 유효 Actor commit 뒤 Post 실패·duplicate에서도 Actor와 Profile 표현을 보존한다. Instance 확보도 독립 경계를 유지하고 Note/Post 실패로 삭제하지 않는다. DB 장애·예상하지 못한 오류는 전파한다.
- Alternatives Considered: author+Post 전체 atomic transaction을 위한 서비스 API 재설계와 commit된 작성자 보상 삭제는 채택하지 않는다.
- Consequences: Post 없는 유효 Actor는 정상 결과이며 재시도·다른 요청이 재사용할 수 있다. 잘못된 Actor 보존을 허용한 것은 아니며 D1에 따라 exact URI를 persistence 전에 검증한다. Post effects는 성공한 Post commit 뒤에만 실행한다.
- Confirmation / Follow-up: Actor 내부 실패 rollback, Actor commit 후 Post 실패 시 보존, duplicate/concurrent identity 수렴, effects 미실행·commit 후 실패 격리를 검증한다.

## Remaining Decisions

- 남은 Human Decision은 없다. D7·D8과 D1의 저장 전 exact URI 검증을 사용자 확정으로 반영했다. 구체 helper 파일·signature는 이 계약 안의 구현 선택이며 새 정책 미결정이 아니다.
- 필요한 최소 helper의 구체 signature·선행 구현 증거·최종 부모 SHA는 구현 착수 시 재확인한다.

## Superseded Decisions

- PROD-661의 독립 공통 projector 선행 조건, 두 단계 projection API 제안과 신규 Reply Note 제외는 2026-09-09 사용자 확정으로 폐기한다.
