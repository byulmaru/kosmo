# 순수 Repost의 Quote Source 표시 검토

이 문서는 2026-09-08 PROD-828의 조사와 결정 검토 기록이다. 현재 canonical 계약은 Post 객체와 디자인
문서, 승인된 ADR을 기준으로 읽는다. 이번 적용안은 사람이 선택한 표시 방향을 반영했으며 같은 task에서
`PROD-828 Domain Gate 승인`으로 다음 gate의 입력이 되었다.

## 요청과 선택

- 요청: PROD-828에 `openspec-propose`와 `kosmo-spec-workflow` 적용.
- 최신 Linear 본문: PROD-828은 표시 깊이의 Domain Gate이며 OpenSpec·구현·기존 archive를 소유하지 않는다.
- 사람의 선택: PROD-828 Spec 대화에서 `X(Twitter) 방식대로`.
- Domain Gate 승인: 같은 task에서 `PROD-828 Domain Gate 승인`.
- 적용안: A의 Repost attribution 아래 B의 Quote 본문과 C의 Source preview를 함께 표시한다. C가 Quote여도
  그 아래 D는 표시하지 않는다. preview 깊이는 Content가 있는 주된 표시 대상 B를 기준으로 센다.
- X 공식 문서에서 확인한 범위와 KOSMO 적용안의 구분은
  [ADR 0027](../decisions/0027-repost-of-quote-source-presentation.md#근거와-적용-범위)에 기록했다.

## Authority 확인

| 근거                                                             | 확인 결과                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PROD-828, 조회 당시 updated `2026-09-07T09:48:30.859Z`, 댓글 0개 | Domain Gate이고 표시 깊이는 미결정이었다. 현재 대화의 선택과 후속 책임을 본문에 갱신했다.                                               |
| Post 객체·ADR 0014                                               | Repost와 Quote는 Content·Reply Parent·Repost Source의 조합이며 Source를 평탄화하지 않는다.                                              |
| Post Action Bar                                                  | 본문·시간·직접 URL은 direct Source로 이동한다. social action은 Source, 순수 Repost Reply는 바깥 contentless Post를 기준으로 disabled다. |
| PROD-415의 2026-07-25·2026-07-27 댓글                            | Source Quote의 preview 생략·유지 설명이 함께 존재한다. 2026-08-24 분리된 PROD-828의 최종 승인 근거로 사용하지 않았다.                   |
| PROD-389·archived add-post-reposts                               | PROD-828의 표시 결정을 후속 범위로 남겼다. 기존 archive 완료를 이번 결정의 승인으로 해석하지 않았다.                                    |
| PROD-431                                                         | 로컬 Quote 작성과 기존 Quote presentation 회귀를 소유한다. pure Repost wrapper의 추가 preview는 PROD-922가 맡는다.                      |
| PROD-792                                                         | 원격 Quote의 승인·철회·조회 가능성에 따른 Source 반환을 소유한다. UI는 반환된 nullable Source만 소비한다.                               |
| PROD-670·PROD-904                                                | 게시 활동 목록은 별도 Backlog 범위다. 표시 깊이 구현이나 archive 책임을 배정하지 않았다.                                                |

## 현재 구현 증거

기준은 main commit `4417b2a8a1a11796ae41adc9921686e1a3e4fe25`다. 아래 행 번호는 이 commit의 읽기
증거이며, 실행 검증 결과를 뜻하지 않는다.

| 경로·위치                                                         | 관찰한 동작                                                                                           | 적용안과의 차이                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/app/src/components/post/PostListItem.tsx:233`               | outer article·attribution 뒤 `PostListRow post={source}`를 표시한다.                                  | B 본문 뒤 C preview가 필요하다. B의 표준 행·단일 article은 유지한다.                                 |
| `apps/app/src/components/post/PostListItem.tsx:311`               | 표준 행은 Author·본문·Action Surface를 표시한다.                                                      | C preview의 소비와 Action Surface 앞 배치가 필요하다.                                                |
| `apps/app/src/components/post/PostSourcePresentationView.tsx:45`  | preview fragment는 대상의 Content·Profile을 읽고 그 아래 Source를 읽지 않는다.                        | C를 leaf preview로 소비하는 기존 경계를 재사용할 수 있다. 구체 구현 수단은 후속 OpenSpec에서 정한다. |
| `apps/app/src/app/(tabs)/(post)/[profileHandle]/[postId].tsx:148` | 순수 Repost ID 직접 접근은 direct Source로 replace redirect한다.                                      | 기존 동작을 유지하고 B가 Quote인 경우를 회귀 검증한다.                                               |
| `apps/app/src/stories/patterns/Posts.stories.tsx:4008`            | `PureRepostOfQuote`는 B 본문만 표시하고 C 본문을 숨기는 현재 동작을 검증한다.                         | C 표시·D cutoff 기대값으로 변경해야 한다.                                                            |
| `apps/app/src/stories/patterns/Posts.stories.tsx:3383`            | production integration은 Quote-of-Quote의 preview와 pure Repost-of-Quote의 표준 행을 별도로 확인한다. | 두 경로를 혼동하지 않고 pure Repost의 C 표시만 보완해야 한다.                                        |
| `apps/app/src/stories/screens/Bookmarks.stories.tsx:509`          | `RepostQuoteUsesOneSourceDepth`의 pure Repost fixture는 C preview를 표시하지 않는다.                  | 기존 소비 경로의 기대값을 정렬하되 Bookmark 후보 정책은 바꾸지 않는다.                               |

## 적용안 검토 목록

| 항목       | 결과                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 표시 순서  | `A님이 재게시함` → B의 표준 Author·생성 시각·Content → C preview → Summary·Action Bar  |
| 깊이       | B를 기준으로 preview 한 단계. C가 Quote여도 D·placeholder·별도 CTA는 생략              |
| 접근성     | 바깥 article 하나, C preview의 독립 Profile·시간 Link, 외부 Link와 본문 shortcut 분리  |
| 이동       | B 본문·시간·Repost URL은 B 상세, C preview 본문·시간은 C 상세, Author는 각각의 Profile |
| Action Bar | B의 social action과 Summary를 한 번 표시. 바깥 Repost Reply disabled 유지              |
| 조회 실패  | C unavailable이면 B 유지·C 생략, B unavailable이면 기존 Repost 제외                    |
| 상세       | Repost 자체 상세 없이 B로 replace redirect. B 상세의 기존 Quote·Reply 계약 적용        |
| 제외       | Quote 작성·알림·federation·게시 활동 목록·저장 Mutation·기존 archive                   |

## 후속 이슈와 검증 책임

[PROD-922](https://linear.app/byulmaru/issue/PROD-922)를 Backlog 초안으로 생성하고 Domain Gate 검토 중
PROD-828에 blocked 관계로 연결했다. Domain Gate 승인 뒤 이 blocker를 해제했다. 담당자는 정혜주이며
부모·자식 계층은 추가하지 않았다.

- PROD-828은 이번 canonical 문서·ADR·책임 정렬과 Domain Gate 승인을 소유한다.
- PROD-922는 공용 UI·fragment 소비, 목록·상세·route·action 통합 검증, 새 OpenSpec의 delta 동기화와
  전체 완료 후 archive를 소유한다. Spec만을 위한 별도 이슈나 archive만을 위한 이슈는 만들지 않는다.
- 다음 단계는 PROD-922의 Issue Gate에서 범위와 책임을 검토하는 것이다. Issue Gate 승인 전에는
  `show-reposted-quote-source-preview` 후보 change를 생성하지 않는다.
- A→B→C와 A→B→C→D, C/B unavailable, 각 Author·B·C·외부 URL 이동, article·Action Bar 하나, Reply
  disabled, Repost URL replace redirect를 실행 결과로 확인한다.
- Home·Profile의 공용 목록, 기존 Bookmark fixture와 Quote·Reply+Quote 목록·상세·thread를 회귀
  검증한다. 화면과 내부 관계가 제공하지 않는 새로운 후보·Source·Reply 관계는 추론하지 않는다.
- 현재 데이터 모델과 Source field를 사용하므로 DB migration·backfill은 계획하지 않는다. schema 변경이
  필요하다는 증거가 생기면 후속 이슈와 해당 gate에서 범위를 다시 판단한다.
- rollout은 preview를 소비하는 UI의 통상 배포로 계획한다. 문제가 생기면 preview 표시 변경을 되돌릴 수
  있으며 저장 관계·canonical URL·mutation target은 바꾸지 않는다. 서버의 Source 노출 정책을 우회하는
  fallback은 만들지 않는다.

## 검증 공백과 승인 상태

이번 조사에서는 코드·fragment·fixture·assertion을 읽었으며 Storybook, Web 화면, Native touch·VoiceOver·TalkBack은
실행하지 않았다. 기존 테스트 파일의 존재를 통과 증거로 사용하지 않는다. 현재 runtime과 제품 전체의 접근성
준수를 주장하지 않는다.

사람이 `PROD-828 Domain Gate 승인`으로 구체 적용안과 후속 책임을 다음 gate의 입력으로 사용하는 것을
승인했다. 이 승인은 PROD-922의 Issue Gate나 OpenSpec Gate를 포함하지 않는다. 다음 단계는 PROD-922의
Issue Gate이며 현재 task에서 구현은 시작하지 않는다.
