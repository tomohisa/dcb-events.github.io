!!! info "Disclaimer"

    The definitions in this list merely reflect our personal take and are not meant to be authoritive!
    However, feel free to report any invalid/missing information in the [bugtracker of this website](https://github.com/dcb-events/dcb-events.github.io/issues)

## Aggregate

Entity that manages state changes exclusively through domain events and enforces consistency via optimistic locking

## Command

Instruction to perform a specific action or change in a system, typically resulting in one or more events if successfully processed

## CQRS (Command Query Responsibility Segregation)

Pattern that separates the responsibilities of handling commands (write operations) and queries (read operations) to optimize and scale each independently

## Decision Model

Representation of the rules and logic used to process commands and decide which events should be generated in response

## Domain-Driven Design

Software design approach that focuses on modeling a system based on the core domain, using the language and concepts of domain experts

## Event

Record of a change or action that has occurred in the past, capturing significant domain-relevant information

## Event Sourcing

Pattern where changes are stored as a sequence of [events](#event), rather than overwriting the current [state](#state)

!!! info

    DCB can be used without Event Sourcing, see [DCB without Event Sourcing](advanced/dcb-without-event-sourcing.md)

## Event Store

Specialized storage system for events that ensures they are stored sequentially and can be retrieved efficiently

## Eventual Consistency

State where data across a distributed system becomes consistent over time, without requiring immediate synchronization

## Optimistic Locking

Concurrency control mechanism that prevents conflicts by allowing multiple transactions to read and update data but checking for changes before committing. If the data has been modified by another transaction in the meantime, the update is rejected

## Pessimistic Locking

Concurrency control mechanism that prevents conflicts by locking a resource for a transaction, blocking others from modifying it until the lock is released

## Process Manager

Component that orchestrates complex workflows by reacting to events, maintaining state, and dispatching commands to coordinate

## Projection

Deriving [state](#state) from a series of events

Projections can be used to persist [read models](#read-model); however, since DCB primarily focuses on the write side, this website typically refers to projections used to construct an in-memory [decision model](#decision-model).

Essentially, a projection can be implemented as a function that takes the current state and an [event](#event) as inputs and returns the updated state:

```haskell
fn (state, event) => state
```

## Read Model

Representation of data tailored for specific read operations, often denormalized for performance

## Read Side

Part of a system responsible for querying and presenting data, typically optimized for read operations

## Reservation Pattern

Refers to a design pattern used to temporarily hold or reserve a resource or state until the process is completed

## Saga

Potentially long-running [Process Manager](#process-manager) that coordinates distributied business workflows

## Sequence

Ordered series of events that represent changes over time

## Sequence Number

Unique, incremental identifier assigned to events, ensuring their correct order within a stream

## State

Current condition or snapshot of a system or entity, derived from a sequence of past events

## View Model

See [Read Model](#read-model)

## Write Side

Part of a system that processes commands, enforces business rules, and generates events