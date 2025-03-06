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
// event fixture
const events = [
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a1", username: "u1" /*, more: data */ },
    tags: ["account:a1", "username:u1"],
  },
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a2", username: "u2" },
    tags: ["account:a2", "username:u2"],
  },
]

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
  }
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.())
}

// example commands
for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`)
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

### 02: Release usernames

This example extends the previous one to show how a previously claimed username could be released whent the corresponding account is suspended

```js
// event fixture
const events = [
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a1", username: "u1" },
    tags: ["account:a1", "username:u1"],
  },
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a2", username: "u2" },
    tags: ["account:a2", "username:u2"],
  },
  {
    type: "ACCOUNT_SUSPENDED",
    data: { id: "a1" },
    tags: ["account:a2", "username:u1"],
  }
]

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
    ACCOUNT_SUSPENDED: () => false,
  }
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.())
}

// example commands
for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`)
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

### 03: Allow changing of usernames

This example extends the previous one to show how the username of an active account could be changed

```js
// event fixture
const events = [
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a1", username: "u1" },
    tags: ["account:a1", "username:u1"],
  },
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a2", username: "u2" },
    tags: ["account:a2", "username:u2"],
  },
  {
    type: "ACCOUNT_SUSPENDED",
    data: { id: "a1" },
    tags: ["account:a2", "username:u1"],
  },
  {
    type: "USERNAME_CHANGED",
    data: { id: "a2", newUsername: "u3" },
    tags: ["account:a2", "username:u2", "username:u3"], // NOTE: contains both tags, of the old and the new username
  },
]

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
    ACCOUNT_SUSPENDED: () => false,
    USERNAME_CHANGED: (_, event) => event.data.newUsername === username,
  }
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.())
}

// example commands
for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`)
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

### 04: Release unused usernames with a configurable delay

This example extends the previous one to show how the release of a username could be postponed by X days

```js
// helper function to generate dates X minutes ago
const minutesAgo = (minutes) => new Date(new Date().getTime() - minutes * (1000 * 60))

// event fixture
const events = [
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a1", username: "u1" },
    tags: ["account:a1", "username:u1"],
    recordedAt: daysAgo(5),
  },
  {
    type: "ACCOUNT_REGISTERED",
    data: { id: "a2", username: "u2" },
    tags: ["account:a2", "username:u2"],
    recordedAt: daysAgo(4),
  },
  {
    type: "ACCOUNT_SUSPENDED",
    data: { id: "a1" },
    tags: ["account:a2", "username:u1"],
    recordedAt: daysAgo(3),
  },
  {
    type: "USERNAME_CHANGED",
    data: { id: "a2", newUsername: "u3" },
    tags: ["account:a2", "username:u2", "username:u3"],
    recordedAt: daysAgo(2),
  },
]

// number of days before a released username can be re-claimed
const usernameReleaseDelayInDays = 3

// helpfer function to calculate the age of an event
const eventAgeInDays = (event) => (new Date - event.recordedAt) / (1000 * 60 * 60 * 24)

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
    ACCOUNT_SUSPENDED: (_, event) => eventAgeInDays(event) < usernameReleaseDelayInDays,
    USERNAME_CHANGED: (_, event) => event.data.newUsername === username || eventAgeInDays(event) < usernameReleaseDelayInDays
  }
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.())
}

// example commands
for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`)
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>
