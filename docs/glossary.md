!!! info "Disclaimer"

    The definitions in this list merely reflect our personal take and are not meant to be authoritive!
    However, feel free to report any invalid/missing information in the [bugtracker of this website](https://github.com/dcb-events/website/issues)

## CQRS

...

## Decision Model

...

## Domain-Driven Design

...

## Event

Events come in many shapes and forms.
On this website, when we mention events we usually refer to domain events which represent a significant state change or occurrence within the system, capturing what has happened, rather than what is to be done.

Each event is immutable and includes all the necessary data to fully describe the change, making it a reliable source of truth for rebuilding the current state of the application.

## Event Sourcing

Key concepts of event sourcing according to our understanding:

1. **Events as the Source of Truth:**

    Every change in the application is captured as an [event](#event) (e.g., `OrderPlaced`, `ItemAddedToCart`). These events are stored sequentially in an [event store](#event-store).

2. **Replayable History:**

    The application's state can be reconstructed at any point by replaying all or some of the events in the [sequence](#sequence). This provides a complete audit trail of what happened.

3. **Immutability:**

    Events, once recorded, are immutable. Any correction or update is handled by appending new events rather than modifying existing ones.

4. **Derived State:**

    The current state (e.g., a database view, cache) is derived from replaying or [projecting](#projection) the events.

5. **Flexibility:**

    Since all changes are stored as events, it's possible to create new [read models](#read-model), troubleshoot bugs by examining the event log, or even replay events for debugging or testing.

6. **Event Store:**

    see [Event Store](#event-store)
    

## Event Store

A specialized storage system for events that ensures they are stored sequentially and can be retrieved efficiently.

## Eventual Consistency

...


## Projection

Deriving [state](#state) from a series of events.

Projections can be used to persist [read models](#read-model); however, since DCB primarily focuses on the write side, this website typically refers to projections used to construct an in-memory [decision model](#decision-model).

In essence a projection can be implemented by a function that retrieves the current state and an  and returns a new state:

Essentially, a rojection can be implemented as a function that takes the current state and an [event](#event) as inputs and returns the updated state:

```haskell
fn (state, event) => state
```

An example scenario could involve sensors at the entry and exit points of a venue, triggering an `ENTERED` event when a person enters and a `LEFT` event when a person exits.
The logic to determine the number of people in the venue could then be implemented as follows:

```javascript
const events = ['ENTERED', 'ENTERED', 'LEFT', 'ENTERED', 'LEFT', 'ENTERED']

const projection = (state, event) => event === 'ENTERED' ? state + 1 : state - 1

console.log(events.reduce(projection, 0)) // number of people in venue
```
<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

## Read Model

According to a famous [DDD](#domain-driven-design) quote

> All models are wrong, but some are useful

One of the super-powers of [event-sourced](#event-sourcing) applications is the option to [project](#projection) events to *multiple* states, each optimized for a concrete requirement.

These states are usually persisted in some database and are referred to as "Read Model" or "View Model".

Since those models are [eventual consistent](#eventual-consistency), they are not meant to be used for [decisions](#decision-model) on the [write-side](#write-side)

## Read Side

...

## Sequence

...

## State

...

## View Model

See [Read Model](#read-model)

## Write Side

...