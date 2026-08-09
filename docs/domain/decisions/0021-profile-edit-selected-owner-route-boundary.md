# ADR 0021: Profile Edit Selected Owner Route Boundary

## 상태

Accepted

## 날짜

2026-07-29

## 후속 결정

Account-Profile Membership을 viewer-relative GraphQL 관계로 투영하고 Profile 편집 eligibility가 이를 사용하는
계약은 [ADR 0023](./0023-profile-viewer-membership-edit-eligibility.md)이 정의한다. 이 ADR의 selected
Owner를 server-authoritative하게 확인하는 경계, presentation과 production route의 분리, Profile Tag와
Follow Approval Policy의 생명주기 결정은 계속 적용된다.

## 맥락

Profile 편집 UI는 selected Profile을 대상으로 하지만, 현재 client session은 selected Profile id만 제공하고
`Profile.instance.kind`는 Local 여부만 알려 준다. 이 정보만으로 Account-Profile Membership Role이 Owner인지
판단할 수 없다. API 연결 전에 실제 protected route를 만들면 직접 URL로 접근한 Member나 권한 없는 사용자가
편집 가능 UI를 볼 수 있고, UI-only 구현이 존재하지 않는 저장 성공을 가장할 위험이 있다.

Profile Tag presentation은 Profile 편집 UI와 함께 먼저 만들 수 있지만 저장·Relay·공개 표시는 별도의 Profile
Tag 계약과 backend 기반을 기다린다. 이 두 생명주기를 분리하면서도 editor UI를 중복 작성하지 않아야 한다.

## 결정

- 실제 `/profile-edit` route는 GraphQL `usingProfile` 경계의 selected Active/Normal Local Profile과 해당
  Account의 Owner Membership을 server-authoritative하게 확인하는 query/capability가 준비될 때만 제공한다.
- client는 selected Profile id, Local origin, route 존재나 화면에서 받은 scalar만으로 Owner 권한을 추측하지
  않는다.
- UI 선제작 slice는 route 없는 controlled `ProfileEditScreen`·`ProfileEditForm`과 상태 카탈로그만 제공한다.
  제출 callback이 없으면 저장 action을 disabled로 표현하고 production navigation을 활성화하지 않는다.
- API 연결 slice가 protected route, Owner capability/query, 초기값 조회, submit/Relay, Media picker·upload,
  성공 navigation과 production 진입점을 함께 소유한다.
- Profile Tag editor presentation은 UI 선제작 slice가 만들고, Profile Tag 연결 slice는 같은 component를
  재사용해 mutation·server validation·Relay와 공개 Profile 표시를 연결한다.
- Follow Approval Policy는 Profile 객체의 정책으로 유지하며, Settings 진입점이 제공되기 전까지 Profile 편집
  화면의 한 줄 Switch와 같은 draft/save 경계에서 다룬다. Switch는 `OPEN`/`APPROVAL_REQUIRED` enum으로
  매핑되고 정책 변경은 기존 Pending Follow Request를 바꾸지 않는다. Settings 진입점이 제공되면
  `PROD-531`이 이 제어를 Settings로 이전하고 Profile 편집의 중복 제어를 제거한다.

## 이유

presentation component를 route와 분리하면 API가 준비되기 전에도 반응형·접근성·상태를 검증할 수 있다. 반대로
권한 query가 없는 상태에서 route까지 선제작하면 client-side 추측을 권한 경계로 오해하게 된다. route와 실제
저장을 같은 slice에 두면 권한, 초기값, mutation과 navigation이 함께 검증되고, UI 선제작 범위도 저장이나
schema로 확장되지 않는다.

Profile Tag editor를 한 번만 만들면 Profile 편집과 Tag 저장 change의 생명주기가 달라도 같은 interaction과
접근성 계약을 재사용할 수 있다.

## 결과

- `PROD-491`은 production route, GraphQL query/mutation, Media picker/upload와 navigation을 소유하지 않는다.
- `PROD-492`가 완료되기 전에는 Profile 편집 진입점을 production에 노출하지 않는다.
- `PROD-527`은 Profile Tag editor를 재작성하지 않고 연결과 공개 표시를 소유한다.
- `PROD-492`는 Settings 이전 전까지 Profile 편집 draft/save에서 Follow Approval Policy의 초기값 조회와
  enum 저장을 함께 소유하며, `PROD-531`은 Settings 진입점 제공 뒤 이 경계를 이전한다.
- 향후 modal presentation이 필요하면 form을 재사용할 수 있지만 현재 승인 UX는 shell 안의 전용 route다.

## 근거

- [PROD-490](https://linear.app/byulmaru/issue/PROD-490/local-profile-수정-화면과-저장-흐름을-제공한다)
- [PROD-491](https://linear.app/byulmaru/issue/PROD-491/프로필-수정-페이지-ui를-선제작한다)
- [PROD-492](https://linear.app/byulmaru/issue/PROD-492/프로필-수정-페이지를-api와-media-관계에-연결한다)
- [PROD-527](https://linear.app/byulmaru/issue/PROD-527/프로필-수정공개-화면에-프로필-태그를-연결한다)
- [PROD-531](https://linear.app/byulmaru/issue/PROD-531/local-profile의-팔로우-승인-정책을-설정-화면에서-변경할-수-있게-한다)
- [ADR 0019](./0019-selected-profile-authorization-boundary.md)

## 문서 반영

- [Profile 편집 디자인](../../design/profile-edit.md)은 필드·상태·반응형 UI와 전달 경계를 정의한다.
- [Profile Tag 디자인](../../design/profile-tags.md)은 editor presentation과 저장·공개 연결 경계를 정의한다.
