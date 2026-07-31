## Decision Records

### PostContent는 실제 Media Node에 표시 권한을 grant한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: canonical Media/PostContent objects, PROD-570
- Status: Active
- Decision Outcome: `PostContent.media`는 `[Media!]`를 반환하고 `readMedia`를 grant한다. Media URL, media type,
  Alt Text는 이 grant를 요구한다. standalone Media loader의 참조 Post 기반 권한은 후속 범위다.
- Consequences: Relay는 Media를 stable Node로 정규화하고 Post 권한은 해당 field subtree에만 전파된다.

### Alt Text는 Media가 소유한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: canonical Media/PostContent objects, ADR 0022, PROD-570
- Status: Active
- Decision Outcome: PostContent Media node는 ID와 순서만 소유하고 Media가 nullable Alt Text를 소유한다.
  createPost는 Alt Text를 Media에 원자적으로 갱신한다. 재사용 시 다른 값은 금지하지 않으며 최신 값이 모든
  참조에 보인다.
- Consequences: Alt Text 변경은 Post revision을 만들지 않는다. 이 재사용 사례를 정상 workflow나 별도 정책으로
  확장하지 않는다.

### 불완전한 representation은 nullable field 전체를 unavailable로 만든다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: canonical Media/PostContent objects, PROD-570
- Status: Active
- Decision Outcome: Media가 없으면 `[]`, 참조 row·Ready 상태·URL·media type 중 하나라도 불완전하면
  `PostContent.media` 전체를 `null`로 반환한다.
