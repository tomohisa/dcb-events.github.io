# Unique username example

Enforcing globally unique values is simple with strong consistency (thanks to tools like unique constraint indexes), but it becomes significantly more challenging with [eventual consistency](../glossary.md#eventual-consistency).

## Challenge

The goal is an application that allows users to subscribe with a username that uniquely identifies them.

As a bonus, this example is extended by adding the following features:

- Allow usernames to be re-claimed when the account was suspended
- Allow users to change their username
- Only release unused usernames after a configurable delay

## Traditional approaches

There are a couple of common strategies to achieve global uniqueness in event-driven systems:

- Use a [Read Model](../glossary.md#read-model) to check for uniqueness and handle a duplication due to race conditions after the fact (e.g. by deactivating the account or changing the username)
    - This is of course a potential solution, with or without DCB, but it falls outside the scope of these examples
- Create a dedicated storage for allocated usernames and make the write side insert a record when the corresponding Event is recorded
    - This adds a source of error and potentially locked usernames unless Event and storage update can be done in a single transaction
- Use the [Reservation pattern](../glossary.md#reservation-pattern) to lock a username and only continue if the locking succeeded
    - This works but adds quite a lot of complexity and additional events and the need for [Sagas](../glossary.md#saga) or multiple writes in a single request

## DCB approach

With DCB all events that affect the unique contraint (the username in this example) can be tagged with the corresponding value (or a hash of it):

![unique username example](img/unique-username-01.png)

### 01: Globally unique username

This example is the most simple one just checking whether a given username is claimed

```js
// decision models:

const isUsernameClaimed = (username) => ({
  initialState: false,
  handlers: {
    AccountRegistered: (state, event) => true,
  },
  tagFilter: [`username:${username}`],
})

// command handler:

const registerAccount = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    isUsernameClaimed: isUsernameClaimed(command.username),
  })
  if (state.isUsernameClaimed) {
    throw new Error(`Username "${command.username}" is claimed`)
  }
  appendEvent(
    {
      type: "AccountRegistered",
      data: { username: "command.username" },
      tags: ["username:command.username"],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "AccountRegistered",
    data: { username: "u1" },
    tags: ["username:u1"],
  },
])

// test cases:

test([
  {
    description: "Register account with claimed username",
    test: () => registerAccount({ username: "u1" }),
    expectedError: 'Username "u1" is claimed',
  },
  {
    description: "Register account with unused username",
    test: () => registerAccount({ username: "u2" }),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 02: Release usernames

This example extends the previous one to show how a previously claimed username could be released whent the corresponding account is suspended

```js hl_lines="7"
// decision models:

const isUsernameClaimed = (username) => ({
  initialState: false,
  handlers: {
    AccountRegistered: (state, event) => true,
    AccountSuspended: (state, event) => false,
  },
  tagFilter: [`username:${username}`],
})

// command handler:

const registerAccount = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    isUsernameClaimed: isUsernameClaimed(command.username),
  })
  if (state.isUsernameClaimed) {
    throw new Error(`Username "${command.username}" is claimed`)
  }
  appendEvent(
    {
      type: "AccountRegistered",
      data: { username: "command.username" },
      tags: ["username:command.username"],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "AccountRegistered",
    data: { username: "u1" },
    tags: ["username:u1"],
  },
  {
    type: "AccountSuspended",
    data: { username: "u1" },
    tags: ["username:u1"],
  },
])

// test cases:

test([
  {
    description: "Register account with released username",
    test: () => registerAccount({ username: "u1" }),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 03: Allow changing of usernames

This example extends the previous one to show how the username of an active account could be changed

```js hl_lines="8"
// decision models:

const isUsernameClaimed = (username) => ({
  initialState: false,
  handlers: {
    AccountRegistered: (state, event) => true,
    AccountSuspended: (state, event) => false,
    UsernameChanged: (state, event) => event.data.newUsername === username,
  },
  tagFilter: [`username:${username}`],
})

// command handler:

const registerAccount = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    isUsernameClaimed: isUsernameClaimed(command.username),
  })
  if (state.isUsernameClaimed) {
    throw new Error(`Username "${command.username}" is claimed`)
  }
  appendEvent(
    {
      type: "AccountRegistered",
      data: { username: "command.username" },
      tags: ["username:command.username"],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "AccountRegistered",
    data: { username: "u1" },
    tags: ["username:u1"],
  },
  {
    type: "UsernameChanged",
    data: { oldUsername: "u1", newUsername: "u1changed" },
    tags: ["username:u1", "username:u1changed"],
  },
])

// test cases:

test([
  {
    description: "Register account with changed username",
    test: () => registerAccount({ username: "u1" }),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 04: Release unused usernames with a configurable delay

This example extends the previous one to show how the release of a username could be postponed by X days

!!! note

    The `daysAgo` property of the `event` is a simplification. Typically, a timestamp representing the event's recording time is stored within the event's payload or metadata. This timestamp can be compared to the current date to determine the event's age in the decision model.

```js hl_lines="7 8"
// decision models:

const isUsernameClaimed = (username) => ({
  initialState: false,
  handlers: {
    AccountRegistered: (state, event) => true,
    AccountSuspended: (state, event) => event.daysAgo <= 3,
    UsernameChanged: (state, event) => event.data.newUsername === username || event.daysAgo <= 3,
  },
  tagFilter: [`username:${username}`],
})

// command handler:

const registerAccount = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    isUsernameClaimed: isUsernameClaimed(command.username),
  })
  if (state.isUsernameClaimed) {
    throw new Error(`Username "${command.username}" is claimed`)
  }
  appendEvent(
    {
      type: "AccountRegistered",
      data: { username: "command.username" },
      tags: ["username:command.username"],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "AccountRegistered",
    data: { username: "u1" },
    tags: ["username:u1"],
  },
  {
    type: "AccountRegistered",
    data: { username: "u3" },
    tags: ["username:u3"],
  },
  {
    type: "AccountRegistered",
    data: { username: "u4" },
    tags: ["username:u4"],
  },
  {
    type: "AccountRegistered",
    data: { username: "u5" },
    tags: ["username:u5"],
  },
  {
    type: "AccountSuspended",
    data: { username: "u1" },
    tags: ["username:u1"],
    daysAgo: 4,
  },
  {
    type: "UsernameChanged",
    data: { oldUsername: "u2", newUsername: "u2changed" },
    tags: ["username:u2", "username:u2changed"],
    daysAgo: 4,
  },
  {
    type: "AccountSuspended",
    data: { username: "u3" },
    tags: ["username:u3"],
    daysAgo: 3,
  },
  {
    type: "UsernameChanged",
    data: { oldUsername: "u4", newUsername: "u4changed" },
    tags: ["username:u4", "username:u4changed"],
    daysAgo: 3,
  },
])

// test cases:

test([
  {
    description: "Register account with username of suspended account before grace period",
    test: () => registerAccount({ username: "u3" }),
    expectedError: 'Username "u3" is claimed',
  },
  {
    description: "Register account with released username before grace period",
    test: () => registerAccount({ username: "u4" }),
    expectedError: 'Username "u4" is claimed',
  },
  {
    description: "Register account with username of suspended account after grace period",
    test: () => registerAccount({ username: "u1" }),
  },
  {
    description: "Register account with released username after grace period",
    test: () => registerAccount({ username: "u2" }),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>
