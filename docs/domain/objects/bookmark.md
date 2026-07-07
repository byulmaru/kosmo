# Bookmark 객체

## 정의

Bookmark는 Profile이 Post를 개인적으로 저장한 결과다.

## 상태

별도 상태 차원은 없다. Bookmark row의 존재가 활성 Bookmark를 뜻한다.

## 속성

| 속성      | 타입/nullability | 검증 정책 | 상태별 존재 조건 | 조회 권한        |
| --------- | ---------------- | --------- | ---------------- | ---------------- |
| 생성 시각 | 시각, 필수       | 미정      | 항상             | `Bookmark.Owner` |

## 관계

| 관계    | 대상                    | 조건           | 조회 권한        |
| ------- | ----------------------- | -------------- | ---------------- |
| Profile | [Profile](./profile.md) | Bookmark owner | `Bookmark.Owner` |
| Post    | [Post](./post.md)       | 저장된 Post    | `Bookmark.Owner` |

## 행동

| 행동          | 행동 주체 Profile | 대상 객체 | 입력값 | 권한                       | 결과                |
| ------------- | ----------------- | --------- | ------ | -------------------------- | ------------------- |
| Bookmark 추가 | Profile           | Bookmark  | Post   | `Bookmark.EligibleProfile` | Bookmark가 생성된다 |
| Bookmark 삭제 | Profile           | Bookmark  | 없음   | `Bookmark.Owner`           | Bookmark가 제거된다 |

## 권한

| 권한                       | 종류      | 성립 조건                                       | 대표 참조          |
| -------------------------- | --------- | ----------------------------------------------- | ------------------ |
| `Bookmark.EligibleProfile` | 객체 종속 | 행동 주체 Profile이 대상 Post를 볼 수 있다      | Bookmark 추가      |
| `Bookmark.Owner`           | 객체 종속 | 행동 주체 Profile이 Bookmark를 만든 Profile이다 | Bookmark 조회/삭제 |

## 불변 조건

- Bookmark는 저장한 Profile에게만 보인다.
- Post 작성자에게 Bookmark 알림을 보내지 않는다.
- Block 발생 시 기존 Bookmark는 삭제한다.

## 확정 용어

- 북마크: Bookmark

## 제외/보류

- Collection은 현재 도메인 범위에서 제외한다.
