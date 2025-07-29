# DCB event store test suite

[k6.io](https://k6.io/) test suite for DCB compliant event stores

## Installation

Install k6 as [documented](https://grafana.com/docs/k6/latest/set-up/install-k6/).

## Tests

### Consistency

Verifies whether the append condition of an Event Store is enforced correctly event with parallel writes

#### Usage

```shell
k6 run dcb-consistency.ts -e DCB_ENDPOINT=<EVENT_STORE_ENDPOINT>
```

> [!NOTE]  
> Replace `<EVENT_STORE_ENDPOINT>` with the URL of the event store (e.g. `https://127.0.0.1:12345` – use `--insecure-skip-tls-verify` to skip TSL verification). GRPC endpoints are supported using the `grpc://` schema

### Monotony of positions

Verifies whether the position of the read events is always monotonic increasing

> [!IMPORTANT]
> This tests requires a running [redis](https://redis.io/) server!

#### Usage

```shell
k6 run dcb-monotonic.ts --insecure-skip-tls-verify -e DCB_ENDPOINT=<EVENT_STORE_ENDPOINT> -e REDIS_DSN=<REDIS_ENDPOINT>
```

> [!NOTE]  
> Replace `<EVENT_STORE_ENDPOINT>` with the URL of the event store (see above), replace `<REDIS_ENDPOINT>` with the redis connection string (e.g. `redis://localhost:6379`)
