## Why

Reply·Repost·Reaction·Bookmark를 실제 게시글 화면에 일관되게 연결하려면 Android·iOS·Web이 공유하는 Action Bar 표시 계약이 먼저 필요하다. 현재 저장소에는 이 액션들의 고정 배치, 처리 상태, 접근성 및 반응형 표현을 독립적으로 검증할 공통 React Native 컴포넌트 계약이 없다.

## What Changes

- 고정 순서 Reply → Repost → Reaction → Bookmark → More를 표시하는 공통 `PostActionBar`를 추가한다.
- Reply·Reaction·Bookmark는 명시적 config로 지속 처리 상태(default·pending·disabled), 선택적 count, callback과 접근성 metadata를 받는다. 구현된 Repost는 `PostActionBar`의 composite Post fragment 아래 private child fragment·mutation·pending을 소유하고 `viewerRepost`에서 도메인 상태와 정확한 mutation identity를 함께 파생한다. 범용 `selected` prop을 노출하지 않는다. More는 독립 UI에서 callback-only config를 지원하고, production에서는 composite Post fragment 아래 private `PostDeletionAction`이 surface가 공급한 menu item과 PROD-598 삭제 action을 하나의 menu로 조립한다.
- action 요청 실패는 Action Bar의 지속 `error` 상태로 표시하지 않는다. child action은 요청 직전의 확정된 도메인 상태와 count를 유지하고 surface error callback으로 실패를 전달한다. PROD-414는 Repost의 정확한 action별 한국어 transient toast를 최초 production surface에 연결하고, 나머지 action의 실패 안내와 최종 공통 검증은 PROD-432가 소유한다. 별도의 retry 상태나 toast 버튼 없이 같은 액션을 다시 활성화하면 재시도한다.
- Reaction과 Bookmark에는 count를 표시하지 않는다. Reply와 Repost는 선행 계약이 제공한 count만 실행 환경 locale의 표준 compact notation으로 표시하고, 수동 K/M 반올림·단위 승격·상한 알고리즘을 만들지 않는다.
- PROD-866은 Post action presentation semantic을 추가한다. Reaction active·hover는 `#F97066`, Repost glyph·count의 default·hover·selected는 Light `#16794A`, Dark `#409667`을 사용하고 전역 Success semantic은 변경하지 않는다.
- production Post surface는 composite Post fragment와 나머지 action config로 다섯 액션을 유지하고 대상 Post 자체의 액션 적격성과 현재 실행 주체·세션의 실행 권한을 분리한다. PROD-414는 `PostLayout`에는 Action Bar를, `PostListItem`에는 Action Bar를 담은 목록 전용 slot을 content grid의 마지막 sibling으로 처음 배치하고 Repost menu·toast를 연결한다. 순수 Repost의 Reply는 바깥 contentless Repost binding을 유지해 disabled로 표시하고, Repost·Reaction·Bookmark·More는 direct Source를 대상으로 동작한다. 대상 자체가 부적격하거나 인증된 실행 주체가 권한을 갖지 못한 액션은 disabled로 표시한다. target 자체가 적격할 때 guest는 기존 인증 진입으로 위임하고, valid 세션에서 selected Profile이 없으면 기존 Profile 선택기를 열며, session error에서는 비활성화한다. resolution 전에 child UI나 mutation을 시작하지 않고 Profile 선택 뒤 원래 action을 자동 재실행하지 않는다.
- More의 공개 API는 독립 UI용 callback config와 production용 menu item·삭제 완료 callback 입력을 구분한다. production의 private `PostDeletionAction`은 PROD-432가 소유한 ADR 0015 `링크 복사`와 완료된 PROD-598의 작성자 `삭제` action을 하나의 팝업에 조합한다. `링크 복사`는 항상 첫 항목이고 삭제 자격이 있는 경우에만 destructive `삭제`를 마지막에 추가한다. Content 없는 Repost에서는 독립 상세 참조를 노출하지 않고 조회 가능한 direct Repost Source의 공유 참조와 삭제 자격을 사용한다. 삭제 확인·mutation·cache·실패 계약은 PROD-598 소유권을 유지한다.
- 공통 컴포넌트는 PROD-433, 최초 production 배치와 Repost menu·toast는 PROD-414, 준비된 나머지 action 연결과 최종 통합 검증은 각 action 이슈와 PROD-432가 소유하도록 공유 구현 순서를 정의한다. 취소된 PROD-434의 독립 surface task는 실행하지 않는다.
- canonical Figma Text·Media `PostListItem`은 카드 상단 12px·하단 4px, 기존 content gap 4px 뒤 Action Bar slot 상단 4px·하단 0을 사용한다. Quote와 순수 Repost의 별도 spacing은 유지한다. production은 현재 spacing과 규범 spec을 유지한다. 같은 target의 코드 적용은 관련 Product 이슈를 확인하고 별도 OpenSpec spec·task를 연결한 뒤 진행한다.
- PROD-432 완료 뒤 발견된 실제 Clipboard 런타임 회귀는 PROD-632가 후속 조사·복구한다. PROD-432는 기존 구현 완료 이력으로 유지한다. 확인된 production bundle에서는 `EXPO_PUBLIC_WEB_ORIGIN` env가 literal `undefined`로 주입되어 clipboard 호출 전에 URL 생성이 실패했다. 현재 구현 slice는 실제 복사 실패를 정확히 감지해 한국어 안내와 재시도를 제공하지만, 기존 실패 환경의 복사 성공 자체를 보장하지 않는다. PROD-632가 원인 재현을 기록하고, 동일 환경의 변경 전 실패·변경 후 성공 근거 확보, Web·지원 Native 플랫폼 검증, 최종 정합성 확인과 change archive를 계속 소유한다.
- `docs/domain`·`docs/design`은 제품·디자인의 canonical source, Linear는 범위·소유권·의존성의 source, 이 OpenSpec은 상태·입력·접근성·통합 동작의 규범 계약으로 사용한다. Figma Action 노드는 상태·동작의 시각 참고 자료로 유지하되, DSN-49 범위의 canonical `PostListItem` Text·Media source는 승인된 spacing에 맞춰 동기화한다. 이 Figma·문서 변경은 production 구현 완료 증거가 아니다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0015-post-share-reference.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/profile.md`, `docs/domain/README.md`, `docs/design/breakpoints.md`, `docs/design/post-action-bar.md`
- Linear Contract: `PROD-432`; presentation semantic implementation: `PROD-866`; Figma consumer sync: `DSN-49`
- Excluded lifecycle: production spacing migration은 현재 PR과 규범 spec·task에서 제외한다. 관련 Product 이슈를 확인한 뒤 적용 OpenSpec에 별도 spec delta와 구현·runtime 검증 task를 추가한다.
- Linear Implementations: `PROD-433`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425`, presentation semantic `PROD-866`, 후속 복구·archive owner `PROD-632`; sibling More action owner: `PROD-598`; canceled ownership record: `PROD-434`

## Capabilities

### New Capabilities

- `post-action-bar`: 게시글 액션의 고정 배치, 상태 표현, 입력·접근성 계약과 production surface 통합 경계를 정의한다.

### Modified Capabilities

없음.

## Impact

- 계약 부모: [PROD-432](https://linear.app/byulmaru/issue/PROD-432/post-action-bar%EB%A5%BC-%EA%B5%AC%ED%98%84%EB%90%9C-post-%EC%95%A1%EC%85%98%EC%97%90-%EC%97%B0%EA%B2%B0%ED%95%98%EA%B3%A0-%ED%86%B5%ED%95%A9-%EA%B2%80%EC%A6%9D%ED%95%9C%EB%8B%A4)
- 구현 자식: [PROD-433](https://linear.app/byulmaru/issue/PROD-433/post-action-bar-ui-%EC%BB%B4%ED%8F%AC%EB%84%8C%ED%8A%B8%EB%A5%BC-%EA%B5%AC%ED%98%84%ED%95%9C%EB%8B%A4), [PROD-414](https://linear.app/byulmaru/issue/PROD-414/repost-action%EC%9D%84-%EC%A0%9C%EA%B3%B5%ED%95%9C%EB%8B%A4), PROD-417·418·420·425; sibling More action owner: PROD-598; [PROD-434](https://linear.app/byulmaru/issue/PROD-434/post-action-bar%EB%A5%BC-%EA%B2%8C%EC%8B%9C%EA%B8%80-%EB%AA%A9%EB%A1%9D%EC%83%81%EC%84%B8-surface%EC%97%90-%EB%B0%B0%EC%B9%98%ED%95%9C%EB%8B%A4)는 canceled ownership record로만 유지
- 후속 조사·복구·최종 archive: [PROD-632](https://linear.app/byulmaru/issue/PROD-632/%EA%B2%8C%EC%8B%9C%EA%B8%80-more-%EB%A9%94%EB%89%B4%EC%9D%98-%EB%A7%81%ED%81%AC-%EB%B3%B5%EC%82%AC%EA%B0%80-%EB%8F%99%EC%9E%91%ED%95%98%EC%A7%80-%EC%95%8A%EB%8A%94%EB%8B%A4)
- 예상 코드 영역: `apps/app/src/components/post`, `apps/app/src/stories`, 게시글 목록·상세 surface와 관련 Relay fragment
- Action Bar는 기존 theme token과 `lucide-react-native`를 재사용하고, Post 목록 구분선에는 입력·메뉴 외곽선보다 낮은 강도의 semantic `divider` color token을 추가한다. PROD-433은 새 runtime dependency를 추가하지 않는다. PROD-414의 Repost menu·toast도 새 외부 dependency 없이 최소 공용 provider/host와 platform action menu 경계로 구현한다. PROD-432의 링크 복사와 나머지 action 통합은 구현 시점의 공유 경계를 재사용하고, 완료된 PROD-598 삭제 action을 같은 More menu에 조합하되 삭제 도메인 계약을 다시 소유하지 않는다.
- Reply·Repost·Reaction·Bookmark의 저장소·GraphQL mutation·count 집계·도메인 상태 의미·권한·Content·Reply Parent·Repost Source 관계 조합 및 Post Visibility 정책은 선행 이슈 [PROD-414](https://linear.app/byulmaru/issue/PROD-414/repost-action%EC%9D%84-%EC%A0%9C%EA%B3%B5%ED%95%9C%EB%8B%A4), [PROD-417](https://linear.app/byulmaru/issue/PROD-417/reaction-%EC%84%A0%ED%83%9D-ui%EB%A5%BC-%EC%A0%9C%EA%B3%B5%ED%95%9C%EB%8B%A4), [PROD-418](https://linear.app/byulmaru/issue/PROD-418/reaction-%EC%9A%94%EC%95%BD-ui%EB%A5%BC-%EC%A0%9C%EA%B3%B5%ED%95%9C%EB%8B%A4), [PROD-420](https://linear.app/byulmaru/issue/PROD-420/bookmark-action%EC%9D%84-%EC%A0%9C%EA%B3%B5%ED%95%9C%EB%8B%A4), [PROD-425](https://linear.app/byulmaru/issue/PROD-425/reply-%EC%9E%91%EC%84%B1-ui%EB%A5%BC-%EC%A0%9C%EA%B3%B5%ED%95%9C%EB%8B%A4)와 canonical 문서의 기존 계약을 소비하며 이 change에서 재정의하지 않는다. 구현된 child action은 해당 선행 이슈의 fragment·mutation 경계를 내부에 colocate할 수 있지만 toolbar container가 mutation payload나 cache update 정책을 다시 정의하지 않는다. Reaction Type별 count와 Profile 목록은 Reaction Summary에 남고 Action Bar에는 연결하지 않는다.
- 시각 참고: [KOSMO Action 컴포넌트](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=88-1005); canonical spacing source: [PostListItem component set](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1924-1992)
