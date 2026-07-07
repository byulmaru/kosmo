# Search Index 객체

## 정의

Search Index는 Profile, Post, Hashtag, Remote Profile을 검색 가능하게 만드는 영속 색인 항목과 lookup
정책을 표현한다. Search Query, Search Result, Rank는 조회 행동의 값이며 Search Index 속성으로 보존하지
않는다.

## 상태

명시된 Search Index 상태 차원은 없다.

## 속성

| 속성           | 타입/nullability | 검증 정책                                  | 상태별 존재 조건 | 조회 권한          |
| -------------- | ---------------- | ------------------------------------------ | ---------------- | ------------------ |
| 색인 대상 유형 | enum, 필수       | Post, Profile, Hashtag, Remote Profile     | 항상             | `Search.SafeScope` |
| 색인 텍스트    | 문자열, 필수     | viewer가 볼 수 없는 정보는 포함하지 않는다 | 항상             | `Search.SafeScope` |
| 검색 범위      | 정책 값, 필수    | 검색별 안전 정책 적용                      | 항상             | `Search.SafeScope` |

## 관계

| 관계                 | 대상                                              | 조건                         | 조회 권한          |
| -------------------- | ------------------------------------------------- | ---------------------------- | ------------------ |
| Post 결과            | [Post](./post.md)                                 | 검색 가능한 공개 Post        | `Search.SafeScope` |
| Profile 결과         | [Profile](./profile.md)                           | 검색 가능한 Profile          | `Search.SafeScope` |
| Hashtag 결과         | [Hashtag](./hashtag.md)                           | 검색 가능한 Hashtag          | `Search.SafeScope` |
| Word Mute Rule       | [Word Mute Rule](./word-mute-rule.md)             | Word Mute 적용               | `Search.SafeScope` |
| Hashtag Mute Rule    | [Hashtag Mute Rule](./hashtag-mute-rule.md)       | Hashtag Mute 적용            | `Search.SafeScope` |
| Profile Domain Block | [Profile Domain Block](./profile-domain-block.md) | 개인 원격 Instance 차단 적용 | `Search.SafeScope` |
| Instance             | [Instance](./instance.md)                         | Instance Safety State 적용   | `Search.SafeScope` |

## 행동

| 행동                  | 행동 주체 | 대상 객체    | 입력값                           | 권한                          | 결과                          |
| --------------------- | --------- | ------------ | -------------------------------- | ----------------------------- | ----------------------------- |
| Post 검색             | viewer    | Search Index | Search Query                     | `Search.SafeScope`            | 검색 가능한 Post 결과 반환    |
| Profile 검색          | viewer    | Search Index | Search Query                     | `Search.SafeScope`            | 검색 가능한 Profile 결과 반환 |
| Remote Profile lookup | viewer    | Search Index | Remote URL 또는 Qualified Handle | `Lookup.RemoteTargetEligible` | Remote Profile resolve 결과   |

## 권한

| 권한                          | 종류 | 성립 조건                                              | 대표 참조             |
| ----------------------------- | ---- | ------------------------------------------------------ | --------------------- |
| `Search.SafeScope`            | 독립 | 검색 안전 정책을 통과한다                              | Post/Profile 검색     |
| `Lookup.RemoteTargetEligible` | 독립 | 원격 lookup 대상이 safety/reachability 제한을 통과한다 | Remote Profile lookup |

## 불변 조건

- 검색은 viewer가 볼 수 없는 Post와 차단/정지된 Profile을 노출하면 안 된다.
- Search 적용 위치의 Word Mute Rule과 Hashtag Mute Rule만 검색 결과 제외에 사용한다.
- 실제 운영자 action으로 제한, 정지, 삭제된 Post와 Profile만 검색 후보에서 제외한다.
- Remote Profile lookup과 일반 검색은 실패 사유와 의미를 구분해야 한다.
- Quiet Public, Followers Only, Mentioned Profiles Post는 검색 결과에 노출하지 않는다.
- Domain Limit 상태인 Instance의 콘텐츠는 공개 탐색 성격의 Search 후보에서 제외한다.
- Domain Block 상태인 Instance 또는 Profile 도메인 차단에 걸린 원격 Instance의 콘텐츠는 검색과 lookup에서 없는 것처럼
  취급한다.
- Unreachable 또는 Suspended 상태인 Instance에는 새 Remote Profile lookup 요청을 보내지 않는다.

## 확정 용어

- 검색: Search
- 검색 질의: Search Query
- 검색 결과: Search Result
- 원격 조회: Lookup
- 검색 색인: Search Index

## 제외/보류

- 추천 검색어, 인기 해시태그, trend, spelling suggestion, 해시태그 자동완성은 현재 범위에서 제외한다.
- Custom Post List와 키워드 기반 독립 Post List는 현재 범위에서 제외한다.
