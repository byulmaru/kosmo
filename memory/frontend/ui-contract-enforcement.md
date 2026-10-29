# Frontend: UI Contract Enforcement

이 문서는 KOSMO의 정적 UI 계약 검사와 PR 경계를 설명한다. 검사 통과는 Figma 일치, 의미적 시각 중복의 부재, Web·iOS·Android runtime 또는 원격 merge ruleset 적용을 증명하지 않는다. PR classifier 결과는 참고용 UI Contract Review이며, 그 결과 하나로 PR 분리나 제품 구조 변경을 기계적으로 강제하지 않는다.

## 변경 분류와 PR 경계

- 이미 공개된 named prop·variant와 기존 composition point를 재사용하는 consumer 변경은 기능 PR에서 진행할 수 있다. Production component와 story/source 경로를 근거로 남긴다.
- 새 component·variant·public visual prop을 만들거나 작은 visual contract를 바꾸는 변경은 canonical component와 대표 story를 다루는 UI-only PR로 분리하는 것을 reviewer와 확인한다. route·data·Relay·API·mutation·cache·권한·feature flag 같은 runtime 통합은 별도 feature/runtime PR에서 연결한다.
- 기존 Production component의 state·variant·callback·interaction 지원을 보강하는 변경도 UI-only PR 경계로 검토한다. 배치·placement·margin·flex·width·height·padding 같은 caller-owned layout 조정은 그 자체로 visual contract 변경으로 분류하지 않는다.
- 기존 recipe와 예외는 현재 UI를 보존하기 위해 유지할 수 있지만, legacy snapshot에 있다는 사실은 새 디자인 승인이나 새 consumer의 면제가 아니다. 버그 복구·의도적 recipe는 근거와 영향 범위를 리뷰에서 설명한다.

## ESLint가 검사하는 범위

현재 검사 대상은 canonical `Button`, `IconButton`, `TextField`, `TextArea`, `RadioOption`, `StateView`를 사용하는 consumer의 다음 prop이다.

| Canonical control       | 검사하는 style prop    |
| ----------------------- | ---------------------- |
| `Button`                | `style`                |
| `IconButton`            | `style`, `visualStyle` |
| `TextField`, `TextArea` | `style`                |
| `RadioOption`           | `style`                |
| `StateView`             | `actionStyle`          |

검사하는 시각 key는 `color`, `background*`, `border*`, `font*`, `shadow*`, `opacity`, `outline*`이다. `margin`, `flex`, `width`, `height`, `padding` 등 layout·placement key와 기존 `size`, `tone`, `targetSize`, `feedbackTone` 같은 named prop은 blanket 금지하지 않는다. canonical component의 내부 구현(`components/ui/**`)은 자신의 계약을 구현하는 위치이므로 consumer 규칙의 대상이 아니다.

검사는 import alias·namespace와 인식된 직접 `ui/<Control>` 또는 `ui/index` import의 component identity, 같은 파일의 local const object/array, `StyleSheet.create`, member 및 제한된 callback return 경로를 해석한다. 임의의 re-export traversal은 지원하지 않는다. 정적 literal computed key는 검사하지만 동적 계산값을 전체 프로그램의 실제 값으로 추론하지 않는다. 임의의 cross-file style evaluation, semantic token 중복·동등 시각의 판정, 모든 `Pressable`·`TextInput`·raw color 사용의 금지는 이 규칙이 보장하지 않는다.

## Legacy snapshot과 migration

현재 legacy snapshot은 10개 파일, 42개 key, 63개 occurrence를 가진다. 각 entry는 repo-relative file, component, style prop, 정규화한 visual property/value, occurrence count, 이유와 canonical 문서/source reference를 함께 가진다.

- snapshot entry는 기존 UI를 보존하기 위한 정확한 예외 기록이지 file-wide suppression이 아니다.
- consumer가 기존 entry를 제거하거나 occurrence를 줄이는 migration만 matching visual fingerprint와 함께 허용한다. 이미 존재하는 named variant를 선택하는 consumer 정리도 이 좁은 제거 경로에 포함한다.
- 새 entry·count 증가·값/경로/메타데이터 변경은 별도 policy/contract review가 필요한 policy 변경이다. snapshot을 자동 재생성하는 CLI나 blanket `eslint-disable`는 제공하지 않는다.
- 남은 entry는 계속 재현 가능해야 하며, unused entry는 제거를 유도한다. 기존 recipe를 snapshot에 남겼다고 해서 새 코드가 같은 override를 추가할 수 있는 것은 아니다.

## Icon source guardrail

앱 production source(`apps/app/src/**/*.{js,jsx,ts,tsx}`)에서는 새 `react-native-svg` value import·re-export와 intrinsic `<svg>`를 막는다. 기존 canonical geometry/asset owner인 `ui/StateView.tsx`, `ui/BottomTabBarIcon.tsx`, `ui/RadioGroup.tsx`, `ui/ColorPickerPanel.tsx`, `reaction/ReactionPendingSpinner.tsx`, `post/PostComposer.tsx` 여섯 파일만 SVG value import를 유지할 수 있으며, 이 예외도 raw `<svg>`와 Lucide custom API까지 면제하지 않는다.

`svgOwnerFiles`는 consumer visual override의 기존 사용 횟수를 기록한 legacy snapshot과 별개의, 현재 ESLint `no-restricted-imports` 설정에서 사용하는 파일 단위 SVG value import 허용 목록이다. 여섯 owner의 근거와 역할은 다음과 같다.

- `ui/BottomTabBarIcon.tsx`: 제품 전용 custom glyph
- `ui/StateView.tsx`: loading shimmer
- `ui/RadioGroup.tsx`: 선택 indicator
- `ui/ColorPickerPanel.tsx`: color gradient/picker surface
- `reaction/ReactionPendingSpinner.tsx`: reaction loading indicator
- `post/PostComposer.tsx`: composer progress ring

현재 `no-restricted-imports` 설정은 파일 단위로 import를 허용하므로, 이 목록은 기존 내부 SVG 사용을 보존하는 경계다. 새 geometry·새 owner·새 예외를 승인하는 목록은 아니다. owner 내부의 geometry 변경, CSS drawing, 외부 asset binary의 의미는 별도 리뷰 책임으로 남고, raw `<svg>`와 Lucide custom API 제한은 계속 적용된다. 새 custom icon의 등록·canonical component·대표 Story를 같은 UI-only PR에서 다루는 규칙과 실제 runtime consumer를 후속 PR로 분리하는 규칙은 위 legacy snapshot과 독립적이다.

Lucide의 일반 glyph와 type-only import는 허용하고, builtin `no-restricted-imports`의 value import/re-export 제한으로 `createLucideIcon`·`Icon` custom API를 막는다. 이 builtin 경계에서는 namespace import도 custom API와 구분하지 않으므로 일반 named glyph import를 사용한다. Story/test fixture는 production 규칙에서 제외해 inline SVG placeholder를 허용한다. 크기·stroke·color·문자 glyph, 여섯 owner 내부 geometry 변경, CSS drawing과 외부 asset binary의 의미 판정은 이 guardrail이 검사하지 않으며 리뷰에서 확인한다.

새 custom icon은 owner 등록, canonical UI component와 component/pattern representative story를 같은 UI-only PR에서 함께 admission할 수 있다. 별도의 icon-only PR이나 icon-only story는 요구하지 않지만, 해당 PR은 실제 runtime consumer·Relay·route·feature flag 연결을 포함하지 않아야 하며 후속 feature/runtime PR에서 연결한다. 등록 배열은 기존 literal entry를 보존한 채 정확한 `components/*` 경로만 추가할 수 있고, 해당 source의 SVG value import와 변경된 대표 story의 직접 또는 one-hop component import가 함께 있어야 한다. 새 owner 등록 PR과 등록된 custom owner source 변경은 PR 본문에 `고려한 Lucide 대안:`과 `미채택 이유:`를 각각 비어 있지 않게 적어야 한다. 다섯 canonical SVG owner의 기존 geometry 변경에는 이 본문 요구를 적용하지 않는다. 이 검사기는 대안의 의미·승인 품질을 판정하지 않는다.

## PR classifier와 실행 경계

일반 검토에서는 정확한 base/head ref를 지정해 다음과 같이 실행한다.

```sh
node scripts/check-ui-contract-pr.mjs --base <base-sha> --head <head-sha>
```

검사 정책·config·legacy snapshot은 현재 PR base를 신뢰하고, changed paths와 source·catalog·visual/non-visual AST 비교는 base/head의 공통 조상부터 head까지의 변경만 분석한다. policy-only 변경은 허용하지만 policy와 runtime/UI 변경을 함께 다루는 경우 reviewer가 경계를 확인한다. 최초 checker 도입처럼 base에 checker가 없는 경우에만 명시적인 `--bootstrap` 경로를 사용하며, 기존 UI cleanup을 넘어서 새 feature나 새 visual contract를 자동 면제하지 않는다. 예외 snapshot을 자동 생성하거나 갱신하지 않는다.

owner 판단은 `components/ui/**`와 실제 Production component를 import하는 `components`·`patterns` story에 한정한다. screen story만으로 새 canonical owner를 만들 수 없으며, platform sibling(`.native`/`.web`)은 같은 Production module 경계로 본다. `react-relay`, `expo-router`, `FeatureFlagsContext`와 같은 알려진 runtime 연결은 base/head 양쪽 source를 함께 보아 시각 변경과 feature 변경을 섞지 않는다.

custom icon admission은 일반 enforcement-policy 완화와 구분한다. `eslint.config.mjs`의 top-level `svgOwnerFiles` literal array에 기존 entry를 그대로 두고 exact `apps/app/src/components/*` source path를 추가하는 경우만 후보가 되며, 다른 rule/config token 변경·glob·중복·traversal·runtime 혼합·catalog/story 누락은 거부한다. story와 source 관계는 현재 direct import와 bounded one-hop만 해석하고 임의의 re-export/whole-program dependency graph는 지원하지 않는다.

`*.test.stories.*`와 `*.tests.stories.*`는 component·pattern story classifier, 새 UI owner catalog, custom icon 대표 story 증거에서 제외하고 보조 테스트 변경으로 처리한다. main `*.stories.*`가 Production component의 대표 story 책임을 가지며, 이 제외는 Tests story의 Production UI 복제 금지를 완화하지 않고 Storybook의 실제 test 실행도 끄지 않는다.

CLI의 `--merge-group` 경로에서는 webhook의 immutable event head/base와 exact queue entry를 사용한다. GraphQL queue 응답은 exact event head를 찾을 때까지 page를 따라가며, 누락·오류·unknown head·필요한 SHA fetch 실패·local ancestry 검증 실패는 fail closed한다. 선택된 queue entry와 PR의 base/head를 개별적으로 검증하며 moving branch tip이나 전체 repository history query를 성공 근거로 삼지 않는다. 현재 advisory workflow는 `pull_request` 이벤트에서만 실행하고 `merge_group`에는 실행하지 않는다. 기본 Lint workflow의 `merge_group` 트리거와 일반 lint 실행은 유지되며, 이 CLI와 advisory workflow는 required check나 원격 ruleset을 변경하지 않는다.

advisory workflow는 검사 원문과 정확한 base/head SHA를 Actions 요약에 남기고, 같은 저장소의 Dependabot이 아닌 PR에만 실패 결과를 고정 marker 댓글로 생성·갱신한다. 이후 검사가 통과하면 기존 marker 댓글만 해결 상태로 갱신하며 새 성공 댓글은 만들지 않는다. fork PR과 Dependabot PR은 요약만 남기고 댓글을 쓰지 않으며, PR 상태·head/base SHA·본문이 event와 달라진 stale 결과와 더 오래된 run/attempt 결과는 댓글을 건너뛴다. base에 있는 예전 checker를 사용한 도입 PR에서는 이 파일별 상세 진단이 누락될 수 있다.

## 검토 증거와 남은 한계

PR에는 재사용한 component prop/variant와 Production story/source 근거, 또는 분리한 UI-only contract PR와 후속 runtime consumer 경계를 적는다. 이 텍스트와 템플릿 항목, advisory classifier 결과는 reviewer 판단을 위한 증거일 뿐 자동 승인 조건이나 기계적인 PR 분리의 대체·강제가 아니다. 직접 ESLint 규칙은 blocking 검증으로 유지하며, 로컬 `test:eslint`·lint·workflow 검증, 원격 CI/required check·merge ruleset, Native device QA와 Storybook/Production runtime 검증은 각각 별도 상태로 보고한다.
