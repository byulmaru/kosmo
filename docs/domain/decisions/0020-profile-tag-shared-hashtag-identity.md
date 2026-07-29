# ADR 0020: Profile Tag Shared Hashtag Identity

## 상태

Accepted

## 날짜

2026-07-28

## 맥락

[Profile](../objects/profile.md)은 Profile Tag를 제외하고 있었고, [Hashtag](../objects/hashtag.md)는 Post 본문에서
파생되는 관계만 정의했다. Local Profile Owner가 태그를 직접 편집하고 공개 Profile에 표시하려면 Profile
Tag가 bio 표현인지 구조화 관계인지, Post와 Profile이 공유할 canonical Hashtag identity를 어떻게 정의할지,
Local/Remote와 생명주기 경계를 먼저 확정해야 한다.

## 결정

- Hashtag를 Post와 Profile이 공유하는 canonical 공통 주제 identity로 정의한다. Profile Tag라는 별도 durable
  객체나 별도 이름 identity를 만들지 않는다.
- Profile Tag는 Profile이 Hashtag를 참조하는 구조화 관계다. bio 문자열에서 추출하거나 동기화하지
  않는다.
- Hashtag Name 문법·정규화·normalized name uniqueness는 [Hashtag](../objects/hashtag.md)가 소유한다. Profile
  Tag는 이 규칙을 사용한다.
- Profile Tag 관계·API·공개 노출은 순서를 보장하지 않으며 reorder UI를 제공하지 않는다. 제품상 Profile Tag
  개수 상한은 두지 않는다. 목록의 각 입력 이름은 먼저 canonical Hashtag identity로 해석·생성하고, 동일
  Hashtag identity를 둘 이상 참조하면 전체 변경을 거부한다.
- Active Account의 Local Profile Owner만 Profile 편집을 통해 전체 Profile Tag 목록을 원자적으로 교체한다.
  Profile Tag는 Profile과 별도의 편집 권한을 가지지 않는다.
- Profile Tag는 Profile이 공개 조회 가능한 동안에만 함께 공개한다. Profile 비활성화 또는 정지는 관계를
  보존하지만 공개 결과에서 숨기고, Profile 삭제는 관계를 제거한다. 다른 Post나 Profile의 Hashtag 관계에는
  영향을 주지 않는다.
- 이번 전달에서는 Remote Profile의 Profile Tag 수집·표시와 ActivityPub 표현을 제외한다.
- 후속 검색 계약에는 정규화된 Hashtag identity와 공개 조회 가능한 Local Profile 관계를 입력으로 제공한다.
  query 문법, 일치, 정렬, pagination, 인증과 navigation은 검색 Domain Gate에서 별도로 결정한다.

## 이유

같은 주제 이름에 Post용 Hashtag와 Profile용 identity를 따로 만들면 정규화와 검색 결과가 갈라진다. Hashtag를
공통 identity로 정의하되 Profile Tag를 별도 관계로 두면 Post 본문 파생과 Owner의 명시적 편집을 혼동하지
않으면서 동일한 이름 규칙을 공유할 수 있다.

Local 편집·공개 표시만 먼저 전달하면 원격 서버의 Profile metadata 표현을 추정하지 않고도 독립적으로 출시할 수
있다. 관계를 Profile visibility에 종속시키면 태그만으로 비공개 또는 정지 Profile이 노출되는 별도 경로도
만들지 않는다.

## 결과

- Profile Tag 저장은 Profile 소유권과 Hashtag identity 참조를 표현하는 관계가 필요하다.
- Profile 편집은 표현 속성과 Profile Tag 관계를 함께 바꿀 때 원자성을 보장해야 한다.
- 공개 Profile 조회는 Profile visibility를 우회하지 않고 Profile과 함께 관계를 노출해야 한다.
- Remote Profile과 ActivityPub 확장은 별도 canonical 결정과 계약 없이는 추가할 수 없다.
- Profile Tag 검색은 이 결정만으로 활성화되지 않으며 별도 Domain Gate와 OpenSpec을 거친다.

## 근거

- [PROD-523](https://linear.app/byulmaru/issue/PROD-523/프로필-태그-도메인-계약을-확정한다)
- [Profile](../objects/profile.md)
- [Hashtag](../objects/hashtag.md)

## 문서 반영

- [Profile](../objects/profile.md)은 관계, 편집 권한, cardinality와 생명주기를 정의한다.
- [Hashtag](../objects/hashtag.md)은 공유 identity, Hashtag Name 문법·정규화·normalized name uniqueness를 정의한다.
- [Profile Tag 디자인](../../design/profile-tags.md)은 편집·공개 표시의 플랫폼 공통 경계를 정의한다.
