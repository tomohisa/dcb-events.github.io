An EventStore that supports DCB provides a way to:

- **read** an [EventStream](#EventStream) matching a [Query](#Query), optionally starting from a specified [SequencePosition](#SequencePosition)
- **append** an [Event(s)](#Events), optionally specifiying an [AppendCondition](#AppendCondition) to enforce consistency

A typical interface of the `EventStore` (pseudo-code):

```
EventStore {
  read(query: Query, options?: ReadOptions): EventStream
  append(events: Events|Event, condition?: AppendCondition): void
}
```

## Query

The `Query` describes constraints that must be matched by [Event](#Event)s in the [EventStore](#EventStore)
It effectively allows for filtering events by their [type](#EventType) and/or [tags](#Tags).

- It _MUST_ contain a set of [QueryItems](#QueryItem) with at least one item or represent a query that matches all events
- All QueryItems are effectively combined with an **OR**, e.g. adding an extra QueryItem will likely result in more events being returned

To differentiate the two query variants, dedicated factory methods might be useful:

```
Query.fromItems(items)
Query.all()
```

### QueryItem

Each item of a [Query](#Query) allows to target events by their [type](#EventType) and/or [tags](#Tags)

An event, in order to match a specific QueryItem, needs to have the following characteristics:

- the [type](#Event-Type) _MUST_ match **one** of the provided types of the QueryItem
- the [tags](#Tags) _MUST_ contain **all** of the tags specified by the QueryItem

#### Example

The following example query would match events that are either...

- ...of type `EventType1` **OR** `EventType2`
- ...tagged `tag1` **AND** `tag2`
- ...of type `EventType2` **OR** `EventType3` **AND** tagged `tag1`**AND** `tag3`

```json
{
  "criteria": [
    {
      "event_types": ["EventType1", "EventType2"]
    },
    {
      "tags": ["tag1", "tag2"]
    },
    {
      "event_types": ["EventType2", "EventType3"],
      "tags": ["tag1", "tag3"]
    }
  ]
}
```

## ReadOptions

An optional parameter to `EventStore.read()` that allows for cursor-based pagination of events.
It has two parameters:

- `from` an optional [SequencePosition](#SequencePosition) to start streaming events from (depending on the `backwards` flag this is either a _minimum_ or _maximum_ sequence number of the resulting stream)
- `backwards` a flag that, if set to `true`, returns the events in reverse order (default: `false`)
- `limit` an optional number that, if set, limits the event stream to a maximum number of events. This can be useful to only retrieve the last event for example.

```
ReadOptions {
  from?: SequencePosition
  backwards: boolean
  limit?: integer
}
```

## EventStream

When reading from the [EventStore](#EventStore) an `EventStream` is returned.

- It _MUST_ be iterable (e.g. via generator or reactive pattern, depending on the specific implementation)
- It _MUST_ return an [EventEnvelope](#EventEnvelope) for every iteration
- It _CAN_ include new events if they occur during iteration
- Batches of events _MAY_ be loaded from the underlying storage at once for performance optimization
- It _CAN_ provide additional functionality, e.g. a `subscribe()` function to realize reactive behavior

## EventEnvelope

Each item in the [EventStream](#EventStream) is an `EventEnvelope` that consists of the underlying event and metadata, like the [SequencePosition](#SequencePosition) that was added during the `append()` call.

It...

- It _MUST_ contain the [SequencePosition](#SequencePosition)
- It _MUST_ contain the [Event](#Event)
- It _CAN_ include more fields, like timestamps or metadata

### Example

The following example shows a *potential* JSON representation of an Event Envelope:

```json
{
  "event": {
    "type": "SomeEventType",
    "data": "{\"some\":\"data\"}",
    "tags": ["tag1", "tag2"]
  },
  "sequence_number": 1234,
  "recorded_at": "2024-12-10 14:02:40"
}
```

## SequencePosition

When an [Event](#Event) is appended to the [EventStore](#EventStore) a global `SequencePosition` is assigned to it.

It...

- _MUST_ be unique for one EventStore
- _MUST_ be monotonic increasing
- _MUST_ have an allowed minimum value of `1`
- _CAN_ contain gaps
- _SHOULD_ have a reasonably high maximum value (depending on programming language and environment)

## Events

A set of [Event](#Event) instances that is passed to the `append()` method of the [EventStore](#EventStore)

It...

- _MUST_ not be empty
- _MUST_ be iterable, each iteration returning an [Event](#Event)

## Event

- It _MUST_ contain an [EventType](#EventType)
- It _MUST_ contain [EventData](#EventData)
- It _MAY_ contain [Tags](#Tags)
- It _MAY_ contain further fields, like metadata

### Example

A *potential* JSON representation of an Event:

```json
{
  "type": "SomeEventType",
  "data": "{\"some\":\"data\"}",
  "tags": ["tag1", "tag2"]
}
```

## EventType

String based type of the event

- It _MUST_ satisfy the regular expression `^[\w\.\:\-]{1,200}$`

## EventData

String based, opaque payload of an [Event](#Event)

- It _SHOULD_ have a reasonable large enough maximum length (depending on language and environment)
- It _MAY_ contain [JSON](https://www.json.org/)
- It _MAY_ be serialized into an empty string

## Tags

A set of [Tag](#Tag) instances.

- It _MUST_ contain at least one [Tag](#Tag)
- It _SHOULD_ not contain multiple [Tag](#Tag)s with the same value

## Tag

A `Tag` can add domain specific metadata to an event allowing for custom partitioning
Usually a tag represents a concept of the domain, e.g. the type and id of an entity like `product:p123`

- It _MUST_ satisfy the regular expression `/^[[:alnum:]\-\_\:]{1,150}`
- It _CAN_ represent a key/value pair such as `product:123` but that is irrelevant to the Event Store

## AppendCondition

- It _MUST_ contain a [Query](#Query)
- It _MUST_ contain the "expected ceiling" that is _either_ a
  - [SequencePosition](#SequencePosition) - representing the highest position that the client was aware of while building the decision model. *Note:* This number can be _higher_ than the position of the last event matching the Query.
  - `NONE` - no event must match the specified [Query](#Query)

```
AppendCondition {
  query: Query
  expectedCeiling: SequencePosition|NONE
}
```