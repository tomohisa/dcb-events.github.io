!!! warning "Disclaimer"

    The definitions in this list merely reflect our personal take and are not meant to be authoritive!
    However, feel free to report any invalid/missing information in the [bugtracker of this website](https://github.com/dcb-events/dcb-events.github.io/issues)

## Command

An instruction to perform a specific action or change in a system, typically resulting in one or more events if successfully processed

## CQRS (Command Query Responsibility Segregation)

A pattern that separates the responsibilities of handling commands (write operations) and queries (read operations) to optimize and scale each independently

## Decision Model

A representation of the rules and logic used to process commands and decide which events should be generated in response

## Domain-Driven Design

A software design approach that focuses on modeling a system based on the core domain, using the language and concepts of domain experts

## Event

A record of a change or action that has occurred in the past, capturing significant domain-relevant information

## Event Sourcing

A pattern where changes are stored as a sequence of [events](#event), rather than overwriting the current [state](#state)

!!! info

    DCB can be used without Event Sourcing, see [DCB without Event Sourcing](/advanced/dcb-without-event-sourcing)

## Event Store

A specialized storage system for events that ensures they are stored sequentially and can be retrieved efficiently

## Eventual Consistency

A state where data across a distributed system becomes consistent over time, without requiring immediate synchronization

## Projection

Deriving [state](#state) from a series of events

Projections can be used to persist [read models](#read-model); however, since DCB primarily focuses on the write side, this website typically refers to projections used to construct an in-memory [decision model](#decision-model).

Essentially, a projection can be implemented as a function that takes the current state and an [event](#event) as inputs and returns the updated state:

```haskell
fn (state, event) => state
```

## Read Model

A representation of data tailored for specific read operations, often denormalized for performance

## Read Side

The part of a system responsible for querying and presenting data, typically optimized for read operations

## Sequence

An ordered series of events that represent changes over time

## Sequence Number

A unique, incremental identifier assigned to events, ensuring their correct order within a stream

## State

The current condition or snapshot of a system or entity, derived from a sequence of past events

## View Model

See [Read Model](#read-model)

## Write Side

The part of a system that processes commands, enforces business rules, and generates events