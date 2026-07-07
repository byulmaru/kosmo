# Reaction 객체

## 정의

Reaction은 Profile이 Post에 남기는 유니코드 이모지 반응이다.

## 상태

별도 상태 차원은 없다. Reaction row의 존재가 활성 반응을 뜻한다.

## 속성

| 속성          | 타입/nullability | 검증 정책              | 상태별 존재 조건 | 조회 권한      |
| ------------- | ---------------- | ---------------------- | ---------------- | -------------- |
| Reaction Type | 문자열, 필수     | 유니코드 이모지만 허용 | 항상             | `Post.Visible` |
| 생성 시각     | 시각, 필수       | 미정                   | 항상             | `Post.Visible` |

## 관계

| 관계    | 대상                    | 조건            | 조회 권한      |
| ------- | ----------------------- | --------------- | -------------- |
| Profile | [Profile](./profile.md) | Reaction 작성자 | `Post.Visible` |
| Post    | [Post](./post.md)       | Reaction 대상   | `Post.Visible` |

## 행동

| 행동          | 행동 주체 Profile | 대상 객체 | 입력값 | 권한                       | 결과                |
| ------------- | ----------------- | --------- | ------ | -------------------------- | ------------------- |
| Reaction 추가 | Profile           | Reaction  | emoji  | `Reaction.EligibleProfile` | Reaction이 생성된다 |
| Reaction 삭제 | Profile           | Reaction  | 없음   | `Reaction.Owner`           | Reaction이 제거된다 |

## 권한

| 권한                       | 종류      | 성립 조건                                                       | 대표 참조     |
| -------------------------- | --------- | --------------------------------------------------------------- | ------------- |
| `Reaction.EligibleProfile` | 객체 종속 | 행동 주체 Profile이 대상 Post를 볼 수 있고 차단 정책을 통과한다 | Reaction 추가 |
| `Reaction.Owner`           | 객체 종속 | 행동 주체 Profile이 Reaction을 만든 Profile이다                 | Reaction 삭제 |

## 불변 조건

- 행동 주체는 Profile 단위다.
- Post 하나에 대해 같은 Profile은 같은 이모지 Reaction을 하나만 남길 수 있다.
- Post 하나에 대해 같은 Profile이 서로 다른 이모지 Reaction을 여러 개 남길 수 있다.
- Block 발생 시 기존 Reaction은 삭제한다.

## 확정 용어

- 반응: Reaction

## 제외/보류

- 좋아요, 부스트 같은 별도 canonical term은 사용하지 않는다.
