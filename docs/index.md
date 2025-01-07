# Introduction

DCB is a technique for enforcing consistency in an event-driven system.

Event-driven applications have proven to be very effective solutions for distributed systems, allowing temporal and spatial decoupling.

Nevertheless, they come with some downsides. First of all, the well-known eventual consistency issue. The temporal decoupling between the moment an event is published and the moment it is handled generates a gap between the happening fact and its effective propagation and visibility across the system. How large this gap is depends on many factors and can go from a few milliseconds to a very long interval, like hours or even days sometimes.
As a consequence, the decisions the system makes based on the projected state are potentially inaccurate since they are based on potentially obsolete information.

In the majority of cases, this is not a problem at all.

Nevertheless, there are a few situations where it is crucial to avoid mistakes caused by data obsolescence. In these situations, it is paramount to base the decision on the latest information, including those contained in the events already published but not yet handled, still on the fly.

There are many solutions to this problem. DCB is one of them.

Each event published in a specific context is identified by a global sequential index.

Every time the system requires some data to make a decision, it is essential to know how up-to-date those data are. This is possible with a consistency marker — nothing more than the identifier of the latest event the projected data are aware of.

The decision results in one or more events to be published.

Since the data used for making the decision are frozen in time at the moment identified by the consistency marker, the publishing operation needs to be performed only conditionally. The condition that must be fulfilled is that no events that could affect the decision that was just made happened after the consistency marker.

DCB acts as a form of optimistic lock for publishing events.

## Limitations

DCB could guarantee consistency only inside the scope of the global sequential index. Indeed, the events must be ordered to allow the conditional publication based on the consistency marker.
