An EventStore that supports DCB provides a way to:

- **read** an [EventStream](#eventstream) matching a [Query](#query), optionally starting from a specified [SequencePosition](#sequenceposition)
- **append** an [Event(s)](#events), optionally specifiying an [AppendCondition](#appendcondition) to enforce consistency

A typical interface of the `EventStore` (pseudo-code):

```
EventStore {
  read(query: Query, options?: ReadOptions): EventStream
  append(events: Events|Event, condition?: AppendCondition): void
}
```

## Query

The `Query` describes constraints that must be matched by [Event](#event)s in the [EventStore](../glossary.md#event-store)
It effectively allows for filtering events by their [type](#eventtype) and/or [tags](#tags).

- It _MUST_ contain a set of [QueryItems](#queryitem) with at least one item or represent a query that matches all events
- All QueryItems are effectively combined with an **OR**, e.g. adding an extra QueryItem will likely result in more events being returned

To differentiate the two query variants, dedicated factory methods might be useful:

```
Query.fromItems(items)
Query.all()
```

### QueryItem

Each item of a [Query](#query) allows to target events by their [type](#eventtype) and/or [tags](#tags)

An event, in order to match a specific QueryItem, needs to have the following characteristics:

- the [type](#eventtype) _MUST_ match **one** of the provided types of the QueryItem
- the [tags](#tags) _MUST_ contain **all** of the tags specified by the QueryItem

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

- `from` an optional [SequencePosition](#sequenceposition) to start streaming events from (depending on the `backwards` flag this is either a _minimum_ or _maximum_ sequence number of the resulting stream)
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

When reading from the [EventStore](../glossary.md#event-store) an `EventStream` is returned.

- It _MUST_ be iterable (e.g. via generator or reactive pattern, depending on the specific implementation)
- It _MUST_ return an [EventEnvelope](#eventenvelope) for every iteration
- It _CAN_ include new events if they occur during iteration
- Batches of events _MAY_ be loaded from the underlying storage at once for performance optimization
- It _CAN_ provide additional functionality, e.g. a `subscribe()` function to realize reactive behavior

## EventEnvelope

Each item in the [EventStream](#eventstream) is an `EventEnvelope` that consists of the underlying event and metadata, like the [SequencePosition](#sequenceposition) that was added during the `append()` call.

It...

- It _MUST_ contain the [SequencePosition](#sequenceposition)
- It _MUST_ contain the [Event](#event)
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

When an [Event](#event) is appended to the [EventStore](../glossary.md#event-store) a global `SequencePosition` is assigned to it.

It...

- _MUST_ be unique for one EventStore
- _MUST_ be monotonic increasing
- _MUST_ have an allowed minimum value of `1`
- _CAN_ contain gaps
- _SHOULD_ have a reasonably high maximum value (depending on programming language and environment)

## Events

A set of [Event](#event) instances that is passed to the `append()` method of the [EventStore](../glossary.md#event-store)

It...

- _MUST_ not be empty
- _MUST_ be iterable, each iteration returning an [Event](#event)

## Event

- It _MUST_ contain an [EventType](#eventtype)
- It _MUST_ contain [EventData](#eventdata)
- It _MAY_ contain [Tags](#tags)
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

String based, opaque payload of an [Event](#event)

- It _SHOULD_ have a reasonable large enough maximum length (depending on language and environment)
- It _MAY_ contain [JSON](https://www.json.org/)
- It _MAY_ be serialized into an empty string

## Tags

A set of [Tag](#tag) instances.

- It _MUST_ contain at least one [Tag](#tag)
- It _SHOULD_ not contain multiple [Tag](#tag)s with the same value

## Tag

A `Tag` can add domain specific metadata to an event allowing for custom partitioning
Usually a tag represents a concept of the domain, e.g. the type and id of an entity like `product:p123`

- It _MUST_ satisfy the regular expression `/^[[:alnum:]\-\_\:]{1,150}`
- It _CAN_ represent a key/value pair such as `product:123` but that is irrelevant to the Event Store

## AppendCondition

- It _MUST_ contain a [Query](#query)
- It _MUST_ contain the "expected ceiling" that is _either_ a
  - [SequencePosition](#sequenceposition) - representing the highest position that the client was aware of while building the decision model. *Note:* This number can be _higher_ than the position of the last event matching the Query.
  - `NONE` - no event must match the specified [Query](#query)

```
AppendCondition {
  query: Query
  expectedCeiling: SequencePosition|NONE
}
```