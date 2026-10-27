# Frontend: UI Contract Enforcement

이 문서는 KOSMO의 정적 UI 계약 검사와 PR 경계를 설명한다. 검사 통과는 Figma 일치, 의미적 시각 중복의 부재, Web·iOS·Android runtime 또는 원격 merge ruleset 적용을 증명하지 않는다.

## 변경 분류와 PR 경계

- 이미 공개된 named prop·variant와 기존 composition point를 재사용하는 consumer 변경은 기능 PR에서 진행할 수 있다. Production component와 story/source 경로를 근거로 남긴다.
- 새 component·variant·public visual prop을 만들거나 작은 visual contract를 바꾸는 변경은 canonical component와 대표 story를 다루는 UI-only PR로 분리한다. route·data·Relay·API·mutation·cache·권한·feature flag 같은 runtime 통합은 별도 feature/runtime PR에서 연결한다.
- 기존 Production component의 state·variant·callback·interaction 지원을 보강하는 변경도 UI-only PR 경계에 둔다. 배치·placement·margin·flex·width·height·padding 같은 caller-owned layout 조정은 그 자체로 visual contract 변경으로 분류하지 않는다.
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

## PR classifier와 실행 경계

일반 검토에서는 정확한 base/head ref를 지정해 다음과 같이 실행한다.

```sh
node scripts/check-ui-contract-pr.mjs --base <base-sha> --head <head-sha>
```

검사기는 base snapshot/config를 기준으로 changed paths, UI owner source, normalized visual/non-visual AST projection과 legacy migration을 비교한다. policy-only 변경은 허용하지만 policy와 runtime/UI 변경을 섞지 않는다. 최초 checker 도입처럼 base에 checker가 없는 경우에만 명시적인 `--bootstrap` 경로를 사용하며, 기존 UI cleanup을 넘어서 새 feature나 새 visual contract를 자동 면제하지 않는다. 예외 snapshot을 자동 생성하거나 갱신하지 않는다.

owner 판단은 `components/ui/**`와 실제 Production component를 import하는 `components`·`patterns` story에 한정한다. screen story만으로 새 canonical owner를 만들 수 없으며, platform sibling(`.native`/`.web`)은 같은 Production module 경계로 본다. `react-relay`, `expo-router`, `FeatureFlagsContext`와 같은 알려진 runtime 연결은 base/head 양쪽 source를 함께 보아 시각 변경과 feature 변경을 섞지 않는다.

merge queue에서는 webhook의 immutable event head/base와 exact queue entry를 사용한다. GraphQL queue 응답은 exact event head를 찾을 때까지 page를 따라가며, 누락·오류·unknown head·필요한 SHA fetch 실패·local ancestry 검증 실패는 fail closed한다. 선택된 queue entry와 PR의 base/head를 개별적으로 검증하며 moving branch tip이나 전체 repository history query를 성공 근거로 삼지 않는다. 이 CLI와 workflow는 read-only 검사 경계이며, 원격 ruleset을 변경하지 않는다.

## 검토 증거와 남은 한계

PR에는 재사용한 component prop/variant와 Production story/source 근거, 또는 분리한 UI-only contract PR와 후속 runtime consumer 경계를 적는다. 이 텍스트와 템플릿 항목은 리뷰 증거일 뿐 자동 승인 조건의 대체가 아니다. 로컬 `test:eslint`·lint·workflow 검증, 원격 CI/required check·merge ruleset, Native device QA와 Storybook/Production runtime 검증은 각각 별도 상태로 보고한다.
