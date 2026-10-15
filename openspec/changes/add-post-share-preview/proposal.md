## Why

현재는 외부 메신저와 SNS에 Post 링크를 공유해도 공통 KOSMO 정보만 보인다. 링크를 열기 전에 작성자와
내용을 확인할 수 있도록 게시글별 미리보기가 필요하다.

## Goal

기존 Post 공유 URL의 초기 HTML에서 작성자의 닉네임·표시용 핸들, 현재 본문과 공개 가능한 첨부 이미지를
읽을 수 있게 한다. 이번 Spec 세션은 요구사항·설계·검증 계획을 작성하고 구현 세션으로 인계한다.

## What Changes

- `post-share-preview` capability를 추가한다. BFF가 저장된 Post를 guest 기준으로 조회하고 해당 콘텐츠의
  Open Graph·Twitter Card·일반 제목과 설명을 제공한다.
- Post·Reply·Quote·순수 Repost의 기존 공유 대상 규칙, CW·Sensitive Media와 안전한 기본 미리보기를 유지한다.
- 새 외부 공유 계약과 현재 guest 조회 정책의 적용 범위를 canonical·Linear에 반영한다.

## Non-Goals

프로필·해시태그 미리보기, 외부 URL 수집, 원격 Post/Profile fetch·refresh, 이미지 합성, oEmbed/iframe,
동영상·오디오 플레이어, 검색 노출·private 공유 권한 확대는 제외한다. Instance Domain Block 모델과 공통
조회 정책 도입은 별도 moderation 작업이다. PROD-874/906/908의 완료를 기다리지 않는다.

## Constraints

- 로그인 쿠키·selected Profile·User-Agent가 미리보기 공개 범위를 넓히지 않는다.
- CW는 경고문만 제공한다. CW 또는 Sensitive Media로 가린 이미지의 URL·Alt Text도 노출하지 않는다.
- 현재 guest 조회 정책을 적용한다. 최종 Domain Block 정책을 폐기하거나 구현·검증한 것으로 주장하지 않는다.
- JavaScript·navigation 헤더 없이 읽을 수 있어야 하며 기존 앱 상세 진입과 ActivityPub 표현을 보존한다.
- 새로 생성하거나 재검증한 응답이 삭제·조회 불가 이전의 콘텐츠를 재사용하지 않아야 한다.

## Verification

실제 guest 조회와 BFF HTTP 응답을 실행해 대상 일치, 텍스트·이미지 순서, 비노출, 인코딩, GET·HEAD,
content negotiation, 장애·재검증을 확인한다. 브라우저 상세 진입, 인증 없는 이미지 조회, Slack·카카오톡·X
실제 카드는 별도로 확인하고 서비스별 차이와 접근 제한을 기록한다.

## Business Context

- Product canonical: `docs/domain/objects/post.md#post-외부-공유-미리보기`,
  `docs/domain/decisions/0015-post-share-reference.md`, `docs/domain/objects/post-content.md`,
  `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/objects/media.md`.
- Visual design source: `docs/design/logo.md`의 기존 기본 공유 이미지.
- Linear: [PROD-1107](https://linear.app/byulmaru/issue/PROD-1107).
- User agreement: 2026-10-12, 현재 guest 조회 정책을 적용하고 Domain Block 모델 도입은 별도 범위로 확정했다.
  같은 날 새 기능에 대한 OpenSpec 작성을 명시적으로 요청했다.

## Session Status

- Status: Active
- Last updated: 2026-10-12
