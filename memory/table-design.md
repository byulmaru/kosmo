# Table Design Memory

## Drizzle table changes

- 새 테이블을 `packages/core/db/tables.ts`에 추가하거나 기존 foreign key를 바꾸면 `packages/core/db/relations.ts`도 같은 변경에서 갱신한다.
- Relation 스키마는 Drizzle relations v2 API인 `defineRelations`를 사용한다.
- `defineRelations` 콜백 인자는 구조 분해하지 않고 공식 문서 예시처럼 `r` 단일 인자로 받는다.
- Relation 정의에서는 helper와 테이블 컬럼을 `r.one.TableName`, `r.many.TableName`, `r.TableName.columnName` 형태로 참조한다.
- `notNull()` foreign key에 대응하는 `one` relation에는 `optional: false`를 명시한다.
- nullable foreign key에 대응하는 `one` relation은 기본 optional 동작을 사용하고 `optional: false`를 붙이지 않는다.
- 자기 참조 또는 같은 대상 테이블을 여러 컬럼으로 참조하는 relation은 역할이 드러나는 relation 이름을 사용한다.
- DB 초기화는 `packages/core/db/index.ts`에서 `drizzle(..., { relations, schema })` 형태로 v2 relation schema를 함께 전달한다.
