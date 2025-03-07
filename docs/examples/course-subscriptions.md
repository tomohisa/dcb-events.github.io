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

```js
// decision models:

const courseExists = (courseId) => ({
  initialState: false,
  handlers: {
    CourseDefined: (state, event) => true,
  },
  tagFilter: [`course:${courseId}`],
})

// command handler:

const defineCourse = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    courseExists: courseExists(command.courseId),
  })
  if (state.courseExists) {
    throw new Error(`Course with id "${command.courseId}" already exists`)
  }
  appendEvent(
    {
      type: "CourseDefined",
      data: {"courseId":"command.courseId","capacity":"command.capacity"},
      tags: ["course:command.courseId"],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "CourseDefined",
    data: {"courseId":"c1","capacity":10},
    tags: ["course:c1"],
  },
])

// test cases:

test([  {
    description: "Define course with existing id",
    test: () => defineCourse({ courseId: "c1", capacity: 15}),
    expectedError: "Course with id \"c1\" already exists",
  },
  {
    description: "Define course with new id",
    test: () => defineCourse({ courseId: "c2", capacity: 15}),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### Feature 2: Change course capacity

```js
// decision models:

const courseExists = (courseId) => ({
  initialState: false,
  handlers: {
    CourseDefined: (state, event) => true,
  },
  tagFilter: [`course:${courseId}`],
})

const courseCapacity = (courseId) => ({
  initialState: 0,
  handlers: {
    CourseDefined: (state, event) => event.data.capacity,
    CourseCapacityChanged: (state, event) => event.data.newCapacity,
  },
  tagFilter: [`course:${courseId}`],
})

// command handler:

const changeCourseCapacity = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    courseExists: courseExists(command.courseId),
    courseCapacity: courseCapacity(command.courseId),
  })
  if (!state.courseExists) {
    throw new Error(`Course "${command.courseId}" does not exist`)
  }
  if (state.courseCapacity === command.newCapacity) {
    throw new Error(`New capacity ${command.newCapacity} is the same as the current capacity`)
  }
  appendEvent(
    {
      type: "CourseCapacityChanged",
      data: {"courseId":"command.courseId","newCapacity":"command.newCapacity"},
      tags: ["course:command.courseId"],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "CourseDefined",
    data: {"courseId":"c1","capacity":10},
    tags: ["course:c1"],
  },
  {
    type: "CourseCapacityChanged",
    data: {"courseId":"c1","newCapacity":12},
    tags: ["course:c1"],
  },
])

// test cases:

test([  {
    description: "Change capacity of a non-existing course",
    test: () => changeCourseCapacity({ courseId: "c0", newCapacity: 15}),
    expectedError: "Course \"c0\" does not exist",
  },
  {
    description: "Change capacity of a course to the current value",
    test: () => changeCourseCapacity({ courseId: "c1", newCapacity: 12}),
    expectedError: "New capacity 12 is the same as the current capacity",
  },
  {
    description: "Change capacity of a course to a new value",
    test: () => changeCourseCapacity({ courseId: "c1", newCapacity: 15}),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### Feature 3: Subscribe student to course

```js
// decision models:

const courseExists = (courseId) => ({
  initialState: false,
  handlers: {
    CourseDefined: (state, event) => true,
  },
  tagFilter: [`course:${courseId}`],
})

const courseCapacity = (courseId) => ({
  initialState: 0,
  handlers: {
    CourseDefined: (state, event) => event.data.capacity,
    CourseCapacityChanged: (state, event) => event.data.newCapacity,
  },
  tagFilter: [`course:${courseId}`],
})

const studentAlreadySubscribed = (studentId, courseId) => ({
  initialState: false,
  handlers: {
    StudentSubscribedToCourse: (state, event) => true,
  },
  tagFilter: [`student:${studentId}`, `course:${courseId}`],
})

const numberOfCourseSubscriptions = (courseId) => ({
  initialState: 0,
  handlers: {
    StudentSubscribedToCourse: (state, event) => state + 1,
  },
  tagFilter: [`course:${courseId}`],
})

const numberOfStudentSubscriptions = (studentId) => ({
  initialState: true,
  handlers: {
    StudentSubscribedToCourse: (state, event) => state + 1,
  },
  tagFilter: [`student:${studentId}`],
})

// command handler:

const subscribeStudentToCourse = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    courseExists: courseExists(command.courseId),
    courseCapacity: courseCapacity(command.courseId),
    numberOfCourseSubscriptions: numberOfCourseSubscriptions(command.courseId),
    numberOfStudentSubscriptions: numberOfStudentSubscriptions(command.studentId),
    studentAlreadySubscribed: studentAlreadySubscribed(command.studentId, command.courseId),
  })
  if (!state.courseExists) {
    throw new Error(`Course "${command.courseId}" does not exist`)
  }
  if (state.numberOfCourseSubscriptions >= state.courseCapacity) {
    throw new Error(`Course "${command.courseId}" is already fully booked`)
  }
  if (state.studentAlreadySubscribed) {
    throw new Error(`Student "${command.studentId}" is already subscribed to course "${command.courseId}"`)
  }
  if (state.numberOfStudentSubscriptions >= 5) {
    throw new Error(`Student "${command.studentId}" is already subscribed to the maximum number of courses`)
  }
  appendEvent(
    {
      type: "StudentSubscribedToCourse",
      data: {"studentId":"command.studentId","courseId":"command.courseId"},
      tags: ["student:command.studentId","course:command.courseId"],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "CourseDefined",
    data: {"courseId":"c1","capacity":10},
    tags: ["course:c1"],
  },
  {
    type: "CourseDefined",
    data: {"courseId":"c2","capacity":2},
    tags: ["course:c2"],
  },
  {
    type: "CourseDefined",
    data: {"courseId":"c3","capacity":10},
    tags: ["course:c3"],
  },
  {
    type: "StudentSubscribedToCourse",
    data: {"studentId":"s1","courseId":"c1"},
    tags: ["student:s1","course:c1"],
  },
  {
    type: "StudentSubscribedToCourse",
    data: {"studentId":"s1","courseId":"c2"},
    tags: ["student:s1","course:c2"],
  },
  {
    type: "StudentSubscribedToCourse",
    data: {"studentId":"s2","courseId":"c2"},
    tags: ["student:s2","course:c2"],
  },
  {
    type: "StudentSubscribedToCourse",
    data: {"studentId":"s1","courseId":"c4"},
    tags: ["student:s1","course:c4"],
  },
  {
    type: "StudentSubscribedToCourse",
    data: {"studentId":"s1","courseId":"c5"},
    tags: ["student:s1","course:c5"],
  },
  {
    type: "StudentSubscribedToCourse",
    data: {"studentId":"s1","courseId":"c6"},
    tags: ["student:s1","course:c6"],
  },
])

// test cases:

test([  {
    description: "Subscribe student to non-existing course",
    test: () => subscribeStudentToCourse({ studentId: "s1", courseId: "c0"}),
    expectedError: "Course \"c0\" does not exist",
  },
  {
    description: "Subscribe student to fully booked course",
    test: () => subscribeStudentToCourse({ studentId: "s3", courseId: "c2"}),
    expectedError: "Course \"c2\" is already fully booked",
  },
  {
    description: "Subscribe student to the same course twice",
    test: () => subscribeStudentToCourse({ studentId: "s1", courseId: "c1"}),
    expectedError: "Student \"s1\" is already subscribed to course \"c1\"",
  },
  {
    description: "Subscribe student to more than 5 courses",
    test: () => subscribeStudentToCourse({ studentId: "s1", courseId: "c3"}),
    expectedError: "Student \"s1\" is already subscribed to the maximum number of courses",
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### Other implementations

There is a working [JavaScript/TypeScript](https://github.com/sennentech/dcb-event-sourced/tree/main/examples/course-manager-cli) and [PHP](https://github.com/bwaidelich/dcb-example-courses) implementation