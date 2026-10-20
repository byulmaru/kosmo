# 사용자 행동 계측 범위

[PROD-1184](https://linear.app/byulmaru/issue/PROD-1184)는 `main`의 사용자 동작과 앱 소유 PostHog 이벤트를 대조해 빠진 명시적 계측을 보완한다. 조사 기준은 `09fa0bd6`이다. 이 목록은 코드의 계측 범위이며 production 수집이나 전송 성공의 증거가 아니다.

## 기존 계측

| 행동                                       | 기존 이벤트                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 유효한 프로필 표시                         | `profile_view_succeeded`                                                                     |
| 프로필 생성·선택                           | `profile_created`, `profile_selected`                                                        |
| 게시글 작성                                | `post_created`                                                                               |
| 재게시·취소                                | `repost_succeeded`                                                                           |
| 반응 추가·삭제                             | `reaction_added`, `reaction_removed`                                                         |
| 북마크 추가·삭제                           | `bookmark_added`, `bookmark_removed`                                                         |
| 팔로우 관계·요청 생성                      | `follow_succeeded`                                                                           |
| 검색 제출·결과 로드·결과 선택              | `search_submitted`, `search_results_loaded`, `search_result_selected`                        |
| 프로필 해시태그 선택·목록 표시·프로필 선택 | `profile_hashtag_clicked`, `profile_hashtag_list_viewed`, `profile_hashtag_profile_selected` |

웹의 SDK `$pageview`·자동 클릭과 앱 소유 이벤트는 다르다. 클릭만으로 mutation의 성공을 알 수 없으므로 위 성공 이벤트나 아래 추가 이벤트의 대체 자료로 해석하지 않는다. Native SDK는 명시적 앱 이벤트만 수집하며 자동 화면 조회 계측은 이 변경에 포함하지 않는다.

## 추가 계측

| 행동                       | 이벤트와 허용 속성                                                                                                        | 기록 시점                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 팔로우 해제·보낸 요청 취소 | `follow_removed` — `result: unfollow \| request_cancelled`                                                                | 해당 mutation의 성공 결과 확인 후                                              |
| 받은 팔로우 요청 수락·거절 | `follow_request_responded` — `result: accepted \| rejected`                                                               | 해당 응답의 성공 결과 확인 후                                                  |
| 프로필 차단·해제           | `profile_blocked`, `profile_unblocked` — 없음                                                                             | 관계 변경 성공 후                                                              |
| 프로필 뮤트·해제           | `profile_muted`, `profile_unmuted` — 없음                                                                                 | 관계 변경 성공 후                                                              |
| 게시글 고정·해제           | `post_pinned`, `post_unpinned` — 없음                                                                                     | 고정 관계 변경 성공 후                                                         |
| 프로필 태그 알림 뮤트·해제 | `profile_tag_muted`, `profile_tag_unmuted` — 없음                                                                         | 알림 뮤트 관계 변경 성공 후                                                    |
| 게시글 삭제                | `post_deleted` — 없음                                                                                                     | 삭제 성공 응답 확인 후                                                         |
| 원글·답글·인용 작성 구분   | 기존 `post_created`에 `post_type: post \| reply \| quote` 추가                                                            | 기존 작성 성공 시점. 별도 작성 이벤트를 중복 발송하지 않음                     |
| 알림의 유효한 대상 선택    | `notification_opened` — `kind: follow \| followRequest \| reaction \| reply \| quote \| repost \| mention \| operational` | 기존 대상 이동 callback. 목적지 로드 성공이나 읽음 mutation 성공을 뜻하지 않음 |
| 미읽음 알림 개별·모두 읽음 | `notifications_read` — `scope: single \| all`                                                                             | 해당 읽음 mutation의 성공 결과 확인 후                                         |
| 콘텐츠 신고                | `content_report_submitted` — 없음                                                                                         | 서버가 전달 완료를 확인한 뒤                                                   |
| 피드백 전송                | `feedback_submitted` — 없음                                                                                               | 기존 피드백 전송이 성공한 뒤                                                   |
| 프로필 편집·게시 설정 저장 | `profile_updated` — 없음                                                                                                  | 저장 성공 결과 확인 후                                                         |
| 프로필 삭제                | `profile_deleted` — 없음                                                                                                  | 삭제 성공 결과 확인 후                                                         |
| 이전 출처 등록·등록 해제   | `profile_migration_requested` — `action: source_registered \| source_unregistered`                                        | 출처 등록·해제 성공 후. 이전 완료나 팔로워 이동 완료를 뜻하지 않음             |
| 팔로잉 가져오기 요청       | `following_import_requested` — 없음                                                                                       | 서버가 가져오기 요청을 수락한 뒤. 비동기 가져오기 완료를 뜻하지 않음           |
| 테마 선택 변경             | `theme_changed` — `preference: system \| light \| dark`                                                                   | 사용자가 현재 값과 다른 설정을 선택할 때. 초기 복원·기기 테마 변경 제외        |
| 게시글·프로필 링크 복사    | `link_copied` — `target: post \| profile`                                                                                 | 클립보드 쓰기 성공 후. URL은 보내지 않음                                       |

## 공통 경계

- 기존 Account identity와 production 채널 설정을 사용한다. 같은 동작을 클라이언트와 서버에서 각각 집계하지 않는다.
- mutation을 시작한 클릭이나 optimistic 상태로 성공 이벤트를 만들지 않는다. 취소·network 오류·성공 payload 부재는 성공으로 세지 않는다. 기존 UI 오류 처리와 actor 전환 보호를 유지한다.
- 이벤트는 각 동작의 성공 callback에서 한 번 호출한다. 이는 서버 재시도 전체에 대한 exactly-once 보장이나 데이터베이스의 현재 상태 집계가 아니다.
- 새 속성에는 대상 Post·Profile·관계·알림 ID, 이름·handle·이메일, 게시글·신고·피드백 본문, 검색어, 해시태그 원문, 파일·URL, 오류 원문을 넣지 않는다. 기존 이벤트의 승인된 속성은 이 변경에서 재정의하지 않는다.
- PostHog 초기화·전송 실패가 기존 제품 흐름의 성공·실패를 바꾸지 않는다. SDK 표준 metadata와 앱 소유 속성의 경계는 [운영 문서](../../operations/posthog.md)를 따른다.

## 이번 변경과 구분하는 항목

| 항목                                             | 상태·이유                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 계정 가입 완료                                   | 신뢰할 가입 성공 경계가 별도 계약이다. `profile_created`를 가입 완료로 해석하지 않음              |
| 로그인·로그아웃·계정 삭제                        | 기존 identify/reset·삭제 처리를 유지. 계정 삭제 시 분석 데이터를 다시 남기는 정책은 추가하지 않음 |
| 이모지 종류별 분석                               | [PROD-986](https://linear.app/byulmaru/issue/PROD-986). 기존 default/custom 의미 유지             |
| 게시글 편집·안테나                               | 조사한 앱에 실행 가능한 편집·안테나 동작이 없음                                                   |
| 업로드 진행·push token 등록·백그라운드 처리      | 사용자 성공 행동과 구분되는 내부 처리. 원래 업로드·알림 동작 유지                                 |
| 이미지 열기·넘기기·CW 펼치기·스크롤·탭·메뉴 열기 | 별도 명시적 이벤트는 추가하지 않음. 웹 자동 수집과 동일한 의미로 간주하지 않음                    |
| PostHog Dashboard·Cloud 설정·배포·과거 데이터    | 변경하지 않음. 새 이벤트는 배포 전 시점으로 소급 생성할 수 없음                                   |

## 검증과 운영 인수

각 action의 실제 callback·mutation 응답을 실행하는 테스트에서 성공 시 이벤트·속성, 실패·취소·payload 누락 시 비발생, 기존 UI 결과를 확인한다. 공용 이벤트 타입은 허용하지 않은 속성을 거부한다. 실제 실행한 검증 결과는 PR에 기록한다.

배포 후에는 production Web·Native에서 각 새 동작과 실패 경로를 수행해 위 이벤트가 기존 Account identity로 들어오는지, 금지 값이 추가되지 않는지 확인해야 한다. 로컬 테스트는 production Cloud 수집이나 Native 실기기 동작 검증을 대신하지 않는다.
