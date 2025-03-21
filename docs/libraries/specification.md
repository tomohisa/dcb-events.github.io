An EventStore that supports DCB provides a way to:

- **read** an [EventStream](#eventstream) matching a [Query](#query), optionally starting from a specified [SequencePosition](#sequenceposition)
- **append** an [Event(s)](#events), optionally specifying an [AppendCondition](#appendcondition) to enforce consistency

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

To differentiate the two query variants, dedicated factory methods might be helpful:

```
Query.fromItems(items)
Query.all()
```

### QueryItem

Each item of a [Query](#query) allows to target events by their [type](#eventtype) and/or [tags](#tags)

An event, to match a specific QueryItem, needs to have the following characteristics:

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

- `from`: an optional [SequencePosition](#sequenceposition) to start streaming events from (depending on the `backwards` flag, this is either a _minimum_ or _maximum_ sequence number of the resulting stream)
- `backwards`: a flag that, if set to `true`, returns the events in reverse order (default: `false`)
- `limit`: an optional number that, if set, limits the event stream to a maximum number of events. This can be useful for retrieving only the last event, for example.

```
ReadOptions {
  from?: SequencePosition
  backwards: boolean
  limit?: integer
}
```

## EventStream

When reading from the [EventStore](../glossary.md#event-store), an `EventStream` is returned.

- It _MUST_ provide the queried [SequencedEvents](#sequencedevent)
- It _SHOULD_ be implemented as an iterable or as a reactive stream 

## SequencedEvent 

Each item in the [EventStream](#eventstream) is an `Event` that consists of the underlying event, like the [SequencePosition](#sequenceposition) that was added during the `append()` call.

- It _MUST_ contain the [SequencePosition](#sequenceposition)
- It _MUST_ contain the [Event](#event)
- It _MAY_ contain further fields, like metadata defined by the Event Store


### Example

The following example shows a *potential* JSON representation of a Sequenced Event:

```json
{
  "event": {
    ...
  },
  "sequence_position": 1234,
  ...
}
```

## SequencePosition

When an [Event](#event) is appended, the [EventStore](../glossary.md#event-store) assigns a  `SequencePosition` to it.

It...

- _MUST_ be unique in the Event Store
- _MUST_ be monotonic increasing 
- _MAY_ contain gaps 

## Events

A set of [Event](#event) instances that is passed to the `append()` method of the [EventStore](../glossary.md#event-store)

It...

- _MUST_ not be empty
- _MUST_ be iterable, each iteration returning an [Event](#event)

## Event

- It _MUST_ contain an [EventType](#eventtype)
- It _MUST_ contain [EventData](#eventdata)
- It _MAY_ contain [Tags](#tags)
- It _MAY_ contain further fields, like metadata defined by the client

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

Type of the event used to filter events in the [Query](#query).

## EventData

Opaque payload of an [Event](#event)

## Tags

A set of [Tag](#tag)s.

- It _SHOULD_ not contain multiple [Tag](#tag)s with the same value

## Tag

A `Tag` can add domain-specific metadata to an event, allowing for custom partitioning.
Usually, a tag represents a concept of the domain, e.g. the type and id of an entity like `product:p123`

- It _CAN_ represent a key/value pair such as `product:123` but that is irrelevant to the Event Store

## AppendCondition

- It _MUST_ contain a [Query](#query)
- It _MUST_ contain the "safe position" that is _either_ a
  - [SequencePosition](#sequenceposition) - representing the highest position the client was aware of while building the decision model. The Event Store _MUST_ ignore the events before the Safe Position while checking the condition for appending events. *Note:* This number can be _higher_ than the position of the last event matching the Query.
  - `NONE` - no event must match the specified [Query](#query)

```
AppendCondition {
  query: Query
  safe-position: SequencePosition|NONE
}
```
