# Database Design: Review

## Review Posture

- Do not prematurely couple product policy, external API representation, and storage implementation.
- Model only the functionality needed now, but establish boundaries that are expensive to migrate later.
- Separate options, tradeoffs, decisions needed now, and decisions that can be deferred.
- Prefer proposals that are implementable with PostgreSQL and Drizzle ORM.

## Review Order

1. Read the PRD, user scenarios, current schema, and architecture documents first.
2. Identify core domain entities, ownership relationships, lifecycle states, and high-frequency query paths.
3. Check whether each table represents a durable domain concept rather than a UI screen or temporary implementation detail.
4. Review IDs, naming, foreign keys, unique constraints, indexes, deletion policy, and external API representation.
5. Separate MVP schema from schema that can wait for later migrations.
6. Summarize the recommended direction, concrete changes, deferred decisions, and open questions.

## Review Checklist

- Are business identifiers avoided as primary keys?
- Are internal DB IDs separated from GraphQL/REST external IDs?
- Is there a real reason to store prefixed IDs in the database?
- Are new DB IDs standard UUIDv7 without table discriminator coupling?
- Are UUID version, variant, and timestamp bit preservation rules documented?
- Are existing UUIDv8 IDs preserved without data migration?
- Are GraphQL global IDs and DB UUIDs kept as separate responsibilities?
- Is PostgreSQL `uuid` considered before text IDs?
- Can enum/status columns handle near-future state expansion?
- Are N:N relationships with role/state/order/timestamp represented as join tables?
- Is deletion policy clear per table?
- Are original files, media assets, variants, and usage contexts separated?
- Are CDN URL and Object Storage key responsibilities kept separate?
- Are ActivityPub/AT Protocol detail tables deferred until implementation needs are concrete?
- Is the MVP schema small while preserving expensive-to-change boundaries?
- Does each explicit application lock protect a documented critical invariant whose failure would cause severe or
  difficult-to-reverse harm?
- Could a constraint, atomic conditional write, conflict handling, idempotency, or bounded retry replace the lock?
- Are benign social races, especially Follow Request races, handled without explicit pessimistic locking?

## Response Shape For Reviews

Use this format by default for schema design or review responses:

```md
**추천 방향**
짧은 결론.

**스키마 변경안**

- 테이블/컬럼/constraint/index 단위 변경.

**지금 결정할 것**

- 나중에 바꾸기 비싼 결정.

**후속으로 미룰 것**

- 정책이나 UX가 더 정해진 뒤 추가해도 되는 것.

**열린 질문**

- 제품/인프라 결정이 필요한 질문.
```
