## Goal

코미버스 행사에서 자연어 조건에 해당하는 글 전체가 타임라인·검색 결과 등에서 사라지는 구상을 실제 코스모 UI로 소개한다. 이 문서는 현재 제작 메모이며 제품 정책의 정본이 아니다.

## Approved Constraints

- 2026-10-20 사용자 전달: 개발자 확인에 따라 문장 일부·문장 단위 가림은 지원 범위에서 제외하고 글 전체 숨김만 소개한다.
- 전달물은 HTML 목업 또는 몇 장의 이미지다. 실제 모델·판별 정확도·백엔드·운영 데이터·서비스 경로·제품 정책 변경이나 배포는 범위 밖이다.
- 기존 코스모 공용 UI와 가상 글을 사용한다. 준비된 결과를 실제 모델·서비스 결과로 표현하지 않는다.

## Working Approach

`docs/demos/natural-language-mute/index.html`에서 타임라인·검색을 선택하고 각각 설정→적용 전→적용 후를 비교한다. 같은 자연어 조건을 사용하며 대상 글 전체를 목록에서 제외한다. 남은 글의 순서는 유지하고 숨긴 글을 대신하는 카드·행·빈자리는 두지 않는다. 이미지를 눌러 크게 열 수 있다.

타임라인은 기존 `UniversalShell`·`HomeRoute`를 사용한다. 검색은 기존 `SearchToolbar`·`TabList`·`PostListItem`을 Relay fixture와 공용 목록 Provider로 합성한다. 현재 Production 글 검색은 준비 상태이며 이 목업이 실제 검색 구현을 추가하지 않는다. 원본은 `apps/app/src/stories/screens/NaturalLanguageMute.stories.tsx`, 전달 이미지는 같은 폴더의 JPG 5장이다.

이전 문장 가림·공개·재가림 예시와 관련 이미지·원본은 제거한다. Production renderer나 기존 CW 동작은 변경하지 않는다.

## Verification / Limits

Light·390×844의 설정, 타임라인 전후, 검색 전후를 직접 확인한다. 최종 HTML은 1440×1080·390×844에서 두 화면의 선택·이미지 로딩·가로 넘침을 확인한다. 표준 formatter를 적용하고 최신 GitHub CI는 Test phase에 인계한다. 행사 기기·타 브라우저·인쇄·screen reader·Native·모델 품질은 미검증으로 남긴다.
