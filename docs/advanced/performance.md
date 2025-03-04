Performance can mean different things

## Throughput

*tbd:* highly dependant on implementation/hardware but in general comparable to classic Event Stores, early "benchmarks" with PostgreSQL based implementation show 0,001s/event (=1000 events/second) after 1mio events

## Resource utilization

- **CPU/RAM Usage:** Although [Queries](../libraries/specification.md#query) add complexity to the data store mechanism, a well-implemented Event Store should not significantly impact CPU or memory usage
- **Storage Space:** Primarily depends on the domain-specific payload, while the event metadata (e.g., SequencePosition, EventType, Tags, etc.) should only occupy a few bytes per event
- **Network Usage:** Will be slightly higher compared to classical Event Stores because the [Query](../libraries/specification.md#query) has to be transferred for *read* and conditional *write* operations. We consider this overhead to be negligible in practice in most cases

## Scalability

*tbd*

## Concurrency & Parallelism

*tbd*

## Reliability & Stability

*tbd*