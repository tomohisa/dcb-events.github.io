This example demonstrates how DCB can be leveraged to replace a <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn> when implementing a Double opt-in

## Challenge

A Double opt-in process that requires users to confirm their email address before an account is created

## Traditional approaches

- **Stateless:** Store required data and expiration timestamp in an encrypted/signed token

    > :material-forward: This works, but it can lead to very long tokens

- **Persisted token:** The server generates and stores a unique token, tied to the specified email address. When the email address is confirmed, the token is verified and invalidated (e.g., deleted).

    > :material-forward: This method allows the tokens to be short but adds infrastructure overhead and complexity, and may result in stale or unused tokens accumulating over time

## DCB approach

With DCB, a short token (i.e. <dfn title="One-Time Password">OTP</dfn>) can be generated on the server and stored with the data of the initial Event (`SignUpInitiated`).

With that, a dedicated Decision Model can be created that verifies the token. The token is invalidated as soon as the sign up was finalized (`SignUpConfirmed` Event):

```js
// event type definitions:

const eventTypes = {
  "SignUpInitiated": {
    tagResolver: (data) => [`email:${data.emailAddress}`, `otp:${data.otp}`]
  },
  "SignUpConfirmed": {
    tagResolver: (data) => [`email:${data.emailAddress}`, `otp:${data.otp}`]
  },
}

// decision models:

const decisionModels = {
  "pendingSignUp": (emailAddress, otp) => ({
    initialState: null,
    handlers: {
      SignUpInitiated: (state, event) => ({
        data: event.data
      }),
      SignUpConfirmed: (state, event) => ({
        ...state,
        otpUsed: true
      }),
    },
    tagFilter: [`email:${emailAddress}`, `otp:${otp}`],
  }),
}

// command handlers:

const commandHandlers = {
  "confirmSignUp": (command) => {
    const { state, appendCondition } = buildDecisionModel({
      pendingSignUp: decisionModels.pendingSignUp(command.emailAddress, command.otp),
    })
    if (!state.pendingSignUp) {
      throw new Error("No pending sign-up for this OTP / email address")
    }
    if (state.pendingSignUp.otpUsed) {
      throw new Error("OTP was already used")
    }
    appendEvent(
      {
        type: "SignUpConfirmed",
        data: {...state.pendingSignUp.data, otp: command.otp}
      },
      appendCondition
    )
  },

}

// test cases:

test([
  {
    description: "Confirm SignUp for non-existing OTP",
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"john.doe@example.com","otp":"000000"},
      }
    },
    then: {
      expectedError: "No pending sign-up for this OTP \/ email address",
    }
  },   {
    description: "Confirm SignUp for OTP assigned to different email address",
    given: {
      events: [
        {
          type: "SignUpInitiated",
          data: {"emailAddress":"john.doe@example.com","name":"John Doe","otp":"111111"},
        },
      ],
    },
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"jane.doe@example.com","otp":"111111"},
      }
    },
    then: {
      expectedError: "No pending sign-up for this OTP \/ email address",
    }
  },   {
    description: "Confirm SignUp for already used OTP",
    given: {
      events: [
        {
          type: "SignUpInitiated",
          data: {"emailAddress":"john.doe@example.com","name":"John Doe","otp":"222222"},
        },
        {
          type: "SignUpConfirmed",
          data: {"emailAddress":"john.doe@example.com","otp":"222222"},
        },
      ],
    },
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"john.doe@example.com","otp":"222222"},
      }
    },
    then: {
      expectedError: "OTP was already used",
    }
  },   {
    description: "Confirm SignUp for valid OTP",
    given: {
      events: [
        {
          type: "SignUpInitiated",
          data: {"emailAddress":"john.doe@example.com","name":"John Doe","otp":"444444"},
        },
      ],
    },
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"john.doe@example.com","otp":"444444"},
      }
    },
    then: {
      expectedEvent: {
        type: "SignUpConfirmed",
        data: {"emailAddress":"john.doe@example.com","otp":"444444"},
      }
    }
  }, 
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

A requirement might be to _expire_ tokens after a given time (for example: 60 minutes). The example can be easily adjusted to implement that feature:

!!! note

    The `minutesAgo` property of the Event metadata is a simplification. Typically, a timestamp representing the Event's recording time is stored within the Event's payload or metadata. This timestamp can be compared to the current date to determine the Event's age in the decision model.

```js hl_lines="20 44-46"
// event type definitions:

const eventTypes = {
  "SignUpInitiated": {
    tagResolver: (data) => [`email:${data.emailAddress}`, `otp:${data.otp}`]
  },
  "SignUpConfirmed": {
    tagResolver: (data) => [`email:${data.emailAddress}`, `otp:${data.otp}`]
  },
}

// decision models:

const decisionModels = {
  "pendingSignUp": (emailAddress, otp) => ({
    initialState: null,
    handlers: {
      SignUpInitiated: (state, event) => ({
        data: event.data,
        otpExpired: event.metadata?.minutesAgo > 60
      }),
      SignUpConfirmed: (state, event) => ({
        ...state,
        otpUsed: true
        }),
    },
    tagFilter: [`email:${emailAddress}`, `otp:${otp}`],
  }),
}

// command handlers:

const commandHandlers = {
  "confirmSignUp": (command) => {
    const { state, appendCondition } = buildDecisionModel({
      pendingSignUp: decisionModels.pendingSignUp(command.emailAddress, command.otp),
    })
    if (!state.pendingSignUp) {
      throw new Error("No pending sign-up for this OTP / email address")
    }
    if (state.pendingSignUp.otpUsed) {
      throw new Error("OTP was already used")
    }
    if (state.pendingSignUp.otpExpired) {
      throw new Error("OTP expired")
    }
    appendEvent(
      {
        type: "SignUpConfirmed",
        data: {emailAddress: command.emailAddress, otp: command.otp},
      },
      appendCondition
    )
  },

}

// test cases:

test([
  {
    description: "Confirm SignUp for non-existing OTP",
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"john.doe@example.com","otp":"000000"},
      }
    },
    then: {
      expectedError: "No pending sign-up for this OTP \/ email address",
    }
  },   {
    description: "Confirm SignUp for OTP assigned to different email address",
    given: {
      events: [
        {
          type: "SignUpInitiated",
          data: {"emailAddress":"john.doe@example.com","name":"John Doe","otp":"111111"},
        },
      ],
    },
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"jane.doe@example.com","otp":"111111"},
      }
    },
    then: {
      expectedError: "No pending sign-up for this OTP \/ email address",
    }
  },   {
    description: "Confirm SignUp for already used OTP",
    given: {
      events: [
        {
          type: "SignUpInitiated",
          data: {"emailAddress":"john.doe@example.com","name":"John Doe","otp":"222222"},
        },
        {
          type: "SignUpConfirmed",
          data: {"emailAddress":"john.doe@example.com","otp":"222222"},
        },
      ],
    },
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"john.doe@example.com","otp":"222222"},
      }
    },
    then: {
      expectedError: "OTP was already used",
    }
  },   {
    description: "Confirm SignUp for expired OTP",
    given: {
      events: [
        {
          type: "SignUpInitiated",
          data: {"emailAddress":"john.doe@example.com","name":"John Doe","otp":"333333"},
          metadata: {"minutesAgo":61},
        },
      ],
    },
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"john.doe@example.com","otp":"333333"},
      }
    },
    then: {
      expectedError: "OTP expired",
    }
  },   {
    description: "Confirm SignUp for valid OTP",
    given: {
      events: [
        {
          type: "SignUpInitiated",
          data: {"emailAddress":"john.doe@example.com","name":"John Doe","otp":"444444"},
        },
      ],
    },
    when: {
      command: {
        type: "confirmSignUp",
        data: {"emailAddress":"john.doe@example.com","otp":"444444"},
      }
    },
    then: {
      expectedEvent: {
        type: "SignUpConfirmed",
        data: {"emailAddress":"john.doe@example.com","otp":"444444"},
      }
    }
  }, 
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

## Conclusion

This example demonstrates, how DCB can be used to implement a simple double opt-in functionality without the need for additional Read Models or Cryptography