# GraphQL subscriptions

GraphQL Yoga sends subscriptions to clients over Server-Sent Events (SSE). Shared event delivery uses Yoga's typed `createPubSub` contract with the process-wide `redisEventTarget` from `@kosmo/core/redis/pubsub`.

Each local consumer creates its typed `createPubSub<Topics>({ eventTarget: redisEventTarget })` instance. The shared module lazily initializes one Redis publisher and one subscriber from `REDIS_URL` on first use; importing it does not connect. If `REDIS_URL` is unset, it does not connect or fall back to localhost. Return each subscription iterator when its consumer finishes to remove that consumer's topic listener. Call `disposeRedisPubSub()` only during process shutdown to close the shared connections. The singleton is not currently wired into API or worker startup, and the production GraphQL schema has no Subscription fields or event producers yet.

Redis Pub/Sub is transient, and every GraphQL subscription built on this foundation tolerates event loss. A publish issued while the publisher is disconnected is dropped and is not queued for later delivery. Subscribers reconnect and restore their active topic listeners, but messages published while disconnected are not replayed. This transport does not automatically replay events, refetch, or catch up after reconnection. The adapter does not provide persistence, event IDs, cursors, replay, or catch-up reads.

Topic names and payload tuples follow Yoga's `createPubSub` behavior, including dynamic topics encoded as `<topic>:<id>`. Event details cross Redis as JSON, so payloads must be JSON serializable. No-payload events are represented in the serialized envelope without changing their `detail` value.
