# GraphQL subscriptions

GraphQL Yoga sends subscriptions to clients over Server-Sent Events (SSE). Shared event delivery uses the typed `createPubSub` contract from `@graphql-yoga/subscription` and Redis Pub/Sub through `@kosmo/core/redis/pubsub`.

`createRedisPubSub<Topics>(redisUrl)` owns separate Redis publisher and subscriber connections. Calling the factory starts those connections; importing the module does not connect. Call `dispose()` when its owner shuts down, and return each subscription iterator when its consumer finishes. The factory is not currently wired into API or worker startup, and the production GraphQL schema has no Subscription fields or event producers yet.

Redis Pub/Sub is transient, and every GraphQL subscription built on this foundation tolerates event loss. A publish issued while the publisher is disconnected is dropped and is not queued for later delivery. Subscribers reconnect and restore their active topic listeners, but messages published while disconnected are not replayed. This transport does not automatically replay events, refetch, or catch up after reconnection. The adapter does not provide persistence, event IDs, cursors, replay, or catch-up reads.

Topic names and payload tuples follow Yoga's `createPubSub` behavior, including dynamic topics encoded as `<topic>:<id>`. Event details cross Redis as JSON, so payloads must be JSON serializable. No-payload events are represented in the serialized envelope without changing their `detail` value.
