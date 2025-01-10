Uniqueness across...

## Example 01

This example is the most simple one just checking whether a given username is claimed


```js
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
];

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
  };
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.());
};

for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`);
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

## Example 02

This example extends the previous one to show how a previously claimed username could be released whent the corresponding account is suspended

```js
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
];

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
    ACCOUNT_SUSPENDED: () => false,
  };
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.());
};

for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`);
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

## Example 03

This example extends the previous one to show how the username of an active account could be changed

```js
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
];

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
    ACCOUNT_SUSPENDED: () => false,
    USERNAME_CHANGED: (_, event) => event.data.newUsername === username,
  };
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.());
};

for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`);
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

## Example 04

This example extends the previous one to show how the release of a username could be postponed by X days

```js
// little helper function to generate dates X days ago
const daysAgo = (days) => new Date((new Date).getTime() - days * (1000 * 60 * 60 * 24));

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
];

// number of days before a released username can be re-claimed
const usernameReleaseDelayInDays = 3;

// little helpfer function to calculate the age of an event
const eventAgeInDays = (event) => (new Date - event.recordedAt) / (1000 * 60 * 60 * 24);

const isUsernameClaimed = (username) => {
  const projection = {
    $init: () => false,
    ACCOUNT_REGISTERED: () => true,
    ACCOUNT_SUSPENDED: (_, event) => eventAgeInDays(event) < usernameReleaseDelayInDays,
    USERNAME_CHANGED: (_, event) => event.data.newUsername === username || eventAgeInDays(event) < usernameReleaseDelayInDays
  };
  return events
    .filter(event => event.tags.includes(`username:${username}`))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.());
};

for (const username of ['u1', 'u2', 'u3', 'u4']) {
  console.log(`username "${username}" is ${isUsernameClaimed(username) ? 'taken' : 'free'}`);
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>
