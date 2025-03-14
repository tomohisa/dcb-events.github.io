# Course subscription example

The following example showcases the imagined application from Sara Pellegrini's blog post "[Killing the Aggregate](https://sara.event-thinking.io/2023/04/kill-aggregate-chapter-1-I-am-here-to-kill-the-aggregate.html)"

## Challenge

The goal is an application that allows students to subscribe to courses, with the following hard constraints:

- A course cannot accept more than N students
- N, the Course capacity, can change at any time to any positive integer different from the current one
- The course title can change at any time to any title different from the current one
- The student cannot join more than 10 courses

## Traditional approaches

The first and last constraints, in particular, make this example difficult to implement using traditional Event Sourcing, as they cause the `STUDENT_SUBSCRIBED_TO_COURSE` event to impact two separate entities, each with its own constraints.

There are several potential strategies to solve this without DCB:

- Turn one of the invariants into a *soft constraint*, i.e. use the [Read Model](../glossary.md#read-model) for verification and accept the fact that there might be overbooked courses and/or students with more than 10 subscriptions
    - This is of course a potential solution, with or without DCB, but it falls outside the scope of these examples
- Create an aggregate that spans course and student subscriptions
    - This is not a viable solution because it leads to huge aggregates and restricts parallel bookings
- Create an aggregate for each, courses and students, enforcing their constraints and use a [Saga](../glossary.md#saga) to coordinate them
    - This works, but it leads to a lot of complexity and potentially invalid states for a period of time

## DCB approach

With DCB the challenge can be solved simply by adding a [Tag](../libraries/specification.md#tag) for each, the affected course *and* student to the `STUDENT_SUBSCRIBED_TO_COURSE`:

![course subscriptions example](img/course-subscriptions-01.png)

### Feature 1: Register courses

The first implementation just allows to specify new courses and make sure that they have a unique id:

```js
// event type definitions:

const eventTypes = {
  CourseDefined: {
    tagResolver: (data) => [`course:${data.courseId}`],
  },
}

// decision models:

const decisionModels = {
  courseExists: (courseId) => ({
    initialState: false,
    handlers: {
      CourseDefined: (state, event) => true,
    },
    tagFilter: [`course:${courseId}`],
  }),
}

// command handlers:

const commandHandlers = {
  defineCourse: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      courseExists: decisionModels.courseExists(command.courseId),
    })
    if (state.courseExists) {
      throw new Error(`Course with id "${command.courseId}" already exists`)
    }
    appendEvent(
      {
        type: "CourseDefined",
        data: { courseId: command.courseId, capacity: command.capacity },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  {
    description: "Define course with existing id",
    given: {
      events: [
        {
          type: "CourseDefined",
          data: { courseId: "c1", capacity: 10 },
        },
      ],
    },
    when: {
      command: {
        type: "defineCourse",
        data: { courseId: "c1", capacity: 15 },
      },
    },
    then: {
      expectedError: 'Course with id "c1" already exists',
    },
  },
  {
    description: "Define course with new id",
    when: {
      command: {
        type: "defineCourse",
        data: { courseId: "c1", capacity: 15 },
      },
    },
    then: {
      expectedEvent: {
        type: "CourseDefined",
        data: { courseId: "c1", capacity: 15 },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib-v2.js"></codapi-snippet>

### Feature 2: Change course capacity

The second implementation extends the first by a `changeCourseCapacity` command that allows to change the maximum number of seats for a given course:

```js hl_lines="7-9 22-29 36-46"
// event type definitions:

const eventTypes = {
  CourseDefined: {
    tagResolver: (data) => [`course:${data.courseId}`],
  },
  CourseCapacityChanged: {
    tagResolver: (data) => [`course:${data.courseId}`],
  },
}

// decision models:

const decisionModels = {
  courseExists: (courseId) => ({
    initialState: false,
    handlers: {
      CourseDefined: (state, event) => true,
    },
    tagFilter: [`course:${courseId}`],
  }),
  courseCapacity: (courseId) => ({
    initialState: 0,
    handlers: {
      CourseDefined: (state, event) => event.data.capacity,
      CourseCapacityChanged: (state, event) => event.data.newCapacity,
    },
    tagFilter: [`course:${courseId}`],
  }),
}

// command handlers:

const commandHandlers = {
  // ...
  changeCourseCapacity: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      courseExists: decisionModels.courseExists(command.courseId),
      courseCapacity: decisionModels.courseCapacity(command.courseId),
    })
    if (!state.courseExists) {
      throw new Error(`Course "${command.courseId}" does not exist`)
    }
    if (state.courseCapacity === command.newCapacity) {
      throw new Error(`Course capacity was not changed`)
    }
    appendEvent(
      {
        type: "CourseCapacityChanged",
        data: { courseId: command.courseId, newCapacity: command.newCapacity },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  // ...
  {
    description: "Change capacity of a non-existing course",
    when: {
      command: {
        type: "changeCourseCapacity",
        data: { courseId: "c0", newCapacity: 15 },
      },
    },
    then: {
      expectedError: 'Course "c0" does not exist',
    },
  },
  {
    description: "Define course with new id",
    given: {
      events: [
        {
          type: "CourseDefined",
          data: { courseId: "c1", capacity: 12 },
        },
      ],
    },
    when: {
      command: {
        type: "changeCourseCapacity",
        data: { courseId: "c1", newCapacity: 12 },
      },
    },
    then: {
      expectedError: "Course capacity was not changed",
    },
  },
  {
    description: "Change capacity of a course to a new value",
    given: {
      events: [
        {
          type: "CourseDefined",
          data: { courseId: "c1", capacity: 12 },
        },
      ],
    },
    when: {
      command: {
        type: "changeCourseCapacity",
        data: { courseId: "c1", newCapacity: 15 },
      },
    },
    then: {
      expectedEvent: {
        type: "CourseCapacityChanged",
        data: { courseId: "c1", newCapacity: 15 },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib-v2.js"></codapi-snippet>

### Feature 3: Subscribe student to course

The last implementation contains the core example that requires constraint checks across multiple entities, adding a `subscribeStudentToCourse` command with a corresponding handler that checks...

- ...whether the course with the specified id exists
- ...whether the specified course still has available seats
- ...whether the student with the specified id is not yet subscribed to given course
- ...whether the student is not subscribed to more than 5 courses already

```js hl_lines="10-15 36-56 63-91"
// event type definitions:

const eventTypes = {
  CourseDefined: {
    tagResolver: (data) => [`course:${data.courseId}`],
  },
  CourseCapacityChanged: {
    tagResolver: (data) => [`course:${data.courseId}`],
  },
  StudentSubscribedToCourse: {
    tagResolver: (data) => [
      `student:${data.studentId}`,
      `course:${data.courseId}`
    ],
  },
}

// decision models:

const decisionModels = {
  courseExists: (courseId) => ({
    initialState: false,
    handlers: {
      CourseDefined: (state, event) => true,
    },
    tagFilter: [`course:${courseId}`],
  }),
  courseCapacity: (courseId) => ({
    initialState: 0,
    handlers: {
      CourseDefined: (state, event) => event.data.capacity,
      CourseCapacityChanged: (state, event) => event.data.newCapacity,
    },
    tagFilter: [`course:${courseId}`],
  }),
  studentAlreadySubscribed: (studentId, courseId) => ({
    initialState: false,
    handlers: {
      StudentSubscribedToCourse: (state, event) => true,
    },
    tagFilter: [`student:${studentId}`, `course:${courseId}`],
  }),
  numberOfCourseSubscriptions: (courseId) => ({
    initialState: 0,
    handlers: {
      StudentSubscribedToCourse: (state, event) => state + 1,
    },
    tagFilter: [`course:${courseId}`],
  }),
  numberOfStudentSubscriptions: (studentId) => ({
    initialState: true,
    handlers: {
      StudentSubscribedToCourse: (state, event) => state + 1,
    },
    tagFilter: [`student:${studentId}`],
  }),
}

// command handlers:

const commandHandlers = {
  // ...
  subscribeStudentToCourse: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      courseExists: decisionModels.courseExists(command.courseId),
      courseCapacity: decisionModels.courseCapacity(command.courseId),
      numberOfCourseSubscriptions:
        decisionModels.numberOfCourseSubscriptions(command.courseId),
      numberOfStudentSubscriptions:
        decisionModels.numberOfStudentSubscriptions(command.studentId),
      studentAlreadySubscribed: decisionModels.studentAlreadySubscribed(
        command.studentId,
        command.courseId
      ),
    })
    if (!state.courseExists) {
      throw new Error(`Course "${command.courseId}" does not exist`)
    }
    if (state.numberOfCourseSubscriptions >= state.courseCapacity) {
      throw new Error(`Course "${command.courseId}" is already fully booked`)
    }
    if (state.studentAlreadySubscribed) {
      throw new Error(
        `Student already subscribed to this course`
      )
    }
    if (state.numberOfStudentSubscriptions >= 5) {
      throw new Error(
        `Student already subscribed to 5 courses`
      )
    }
    appendEvent(
      {
        type: "StudentSubscribedToCourse",
        data: { studentId: command.studentId, courseId: command.courseId },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  // ...
  {
    description: "Subscribe student to non-existing course",
    when: {
      command: {
        type: "subscribeStudentToCourse",
        data: { studentId: "s1", courseId: "c0" },
      },
    },
    then: {
      expectedError: 'Course "c0" does not exist',
    },
  },
  {
    description: "Subscribe student to fully booked course",
    given: {
      events: [
        {
          type: "CourseDefined",
          data: { courseId: "c1", capacity: 3 },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s1", courseId: "c1" },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s2", courseId: "c1" },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s3", courseId: "c1" },
        },
      ],
    },
    when: {
      command: {
        type: "subscribeStudentToCourse",
        data: { studentId: "s4", courseId: "c1" },
      },
    },
    then: {
      expectedError: 'Course "c1" is already fully booked',
    },
  },
  {
    description: "Subscribe student to the same course twice",
    given: {
      events: [
        {
          type: "CourseDefined",
          data: { courseId: "c1", capacity: 10 },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s1", courseId: "c1" },
        },
      ],
    },
    when: {
      command: {
        type: "subscribeStudentToCourse",
        data: { studentId: "s1", courseId: "c1" },
      },
    },
    then: {
      expectedError: 'Student already subscribed to this course',
    },
  },
  {
    description: "Subscribe student to more than 5 courses",
    given: {
      events: [
        {
          type: "CourseDefined",
          data: { courseId: "c6", capacity: 10 },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s1", courseId: "c1" },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s1", courseId: "c2" },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s1", courseId: "c3" },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s1", courseId: "c4" },
        },
        {
          type: "StudentSubscribedToCourse",
          data: { studentId: "s1", courseId: "c5" },
        },
      ],
    },
    when: {
      command: {
        type: "subscribeStudentToCourse",
        data: { studentId: "s1", courseId: "c6" },
      },
    },
    then: {
      expectedError: 'Student already subscribed to 5 courses',
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib-v2.js"></codapi-snippet>

### Other implementations

There is a working [JavaScript/TypeScript](https://github.com/sennentech/dcb-event-sourced/tree/main/examples/course-manager-cli) and [PHP](https://github.com/bwaidelich/dcb-example-courses) implementation