## ADDED Requirements

### Requirement: Queue configuration and JetStream setup

The system MUST configure NATS JetStream as the durable job queue for server-side asynchronous work using `NATS_URL` as the only NATS connection setting in the initial implementation.

#### Scenario: Worker missing NATS URL

- **WHEN** the worker process starts without `NATS_URL`
- **THEN** the system MUST fail worker startup with a configuration error

#### Scenario: API starts without NATS URL

- **WHEN** the API process starts without `NATS_URL`
- **THEN** the system MUST keep existing `/health` and `/graphql` startup behavior available

#### Scenario: API producer missing NATS URL

- **WHEN** API code initializes a queue producer or enqueues a job without `NATS_URL`
- **THEN** the system MUST fail that producer operation with a configuration error

#### Scenario: Ensure job stream

- **WHEN** a queue producer or worker initializes
- **THEN** the system MUST ensure the configured JetStream job stream exists for the configured job subject prefix
- **AND** the stream MUST retain messages according to the configured JetStream retention and acknowledgement policy

#### Scenario: Default queue settings

- **WHEN** queue-specific environment variables are not provided
- **THEN** the system MUST use `kosmo.jobs` as the subject prefix
- **AND** the system MUST use `KOSMO_JOBS` as the stream name
- **AND** the system MUST use `kosmo-worker` as the durable consumer name
- **AND** the system MUST use `30s` ack wait, `5` max delivery, and `4` worker concurrency

### Requirement: Typed job envelope

The system MUST publish every job with a validated envelope containing a stable job id, job type, envelope version, payload, and enqueue timestamp.

#### Scenario: Publish valid job

- **WHEN** server code enqueues a job with a registered job type and valid payload
- **THEN** the system MUST publish a JetStream message whose subject matches that job type
- **AND** the message body MUST contain the standard job envelope

#### Scenario: Reject invalid payload

- **WHEN** server code enqueues a job with a payload that does not match the registered schema
- **THEN** the system MUST reject the enqueue request before publishing to JetStream

#### Scenario: Reject unknown job type

- **WHEN** server code enqueues a job type that is not registered
- **THEN** the system MUST reject the enqueue request before publishing to JetStream

### Requirement: Durable enqueue acknowledgement and deduplication

The system MUST treat a job as enqueued only after JetStream acknowledges persistence, and MUST use the job id as the JetStream duplicate detection id.

#### Scenario: Publish acknowledged

- **WHEN** JetStream acknowledges a job publish
- **THEN** the enqueue operation MUST return the job id and publish acknowledgement metadata to the caller

#### Scenario: Publish fails

- **WHEN** JetStream does not acknowledge a job publish
- **THEN** the enqueue operation MUST fail without reporting the job as queued

#### Scenario: Duplicate job id

- **WHEN** the same job id is published again within the JetStream duplicate detection window
- **THEN** JetStream MUST not persist a second independent job message for that id

### Requirement: Worker durable consumption and dispatch

The system MUST run workers as durable JetStream consumers that validate each message and dispatch it to the registered handler for the job type.

#### Scenario: Single durable consumer dispatches jobs

- **WHEN** the worker starts
- **THEN** the worker MUST use one durable consumer for the configured job subject prefix
- **AND** the worker MUST dispatch messages to handlers by decoded job type

#### Scenario: Worker processes known job

- **WHEN** a worker receives a message with a valid envelope and registered job type
- **THEN** the system MUST call the matching handler with the decoded payload, job id, and delivery metadata

#### Scenario: Worker acknowledges success

- **WHEN** a job handler completes successfully
- **THEN** the worker MUST acknowledge the JetStream message

#### Scenario: Worker receives unknown job type

- **WHEN** a worker receives a message whose job type is not registered
- **THEN** the worker MUST treat the message as a failed job
- **AND** the worker MUST record a structured error log containing the job id, job type, and delivery count

### Requirement: Retry and JetStream terminal failure handling

The system MUST retry failed jobs through JetStream redelivery according to configured delivery limits and MUST NOT publish an application-managed dead-letter subject in the initial implementation.

#### Scenario: Retryable handler failure

- **WHEN** a job handler fails before the configured maximum delivery count
- **THEN** the worker MUST request JetStream redelivery instead of acknowledging the message

#### Scenario: Terminal handler failure

- **WHEN** a job handler fails at or beyond the configured maximum delivery count
- **THEN** the worker MUST record a structured terminal failure log containing the original job id, job type, delivery count, and error metadata
- **AND** the worker MUST rely on JetStream consumer delivery policy for terminal failure state instead of publishing an application-managed dead-letter message

#### Scenario: Invalid envelope failure

- **WHEN** a worker receives a message with an invalid envelope or unsupported envelope version
- **THEN** the worker MUST treat the message as a failed job
- **AND** the worker MUST record a structured error log with the validation failure reason

### Requirement: At-least-once processing contract

The system MUST expose job processing as at-least-once delivery and MUST provide handler metadata needed to implement idempotent side effects.

#### Scenario: Handler receives delivery metadata

- **WHEN** a worker dispatches a job handler
- **THEN** the handler MUST receive the job id, job type, delivery count, and enqueue timestamp

#### Scenario: Redelivered job

- **WHEN** JetStream redelivers a job after timeout or retry
- **THEN** the worker MUST process the job using the same job id from the original envelope
- **AND** handlers MUST be able to use that job id for idempotency checks

### Requirement: Queue smoke verification

The system MUST include a lightweight smoke job that verifies producer, JetStream persistence, worker dispatch, and acknowledgement without invoking product-specific side effects.

#### Scenario: Smoke job succeeds

- **WHEN** the smoke job is enqueued through the worker package smoke enqueue command in a configured environment
- **THEN** a worker MUST consume and acknowledge the job
- **AND** the handler MUST emit a success log containing the job id
