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


```js
// event fixture
const events = [
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s1", courseId: "c1" },
    tags: ["student:s1", "course:c1"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s2", courseId: "c1" },
    tags: ["student:s2", "course:c1"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s2", courseId: "c2" },
    tags: ["student:s2", "course:c2"],
  },
]

/**
 * the in-memory decision model (aka aggregate)
 *
 * @param {string} studentId
 * @param {string} courseId
 * @returns {Object{course: number, student: number}}
 */
const numberOfSubscriptions = (studentId, courseId) => {
  const projection = {
    $init: () => ({ course: 0, student: 0 }),
    STUDENT_SUBSCRIBED_TO_COURSE: (state, event) => ({
      course: event.data.courseId == courseId ? state.course + 1 : state.course,
      student: event.data.studentId == studentId ? state.student + 1 : state.student,
    }),
  }
  return events
    .filter(
      (event) =>
        event.tags.includes(`student:${studentId}`) || event.tags.includes(`course:${courseId}`)
    )
    .reduce(
      (state, event) => projection[event.type]?.(state, event) ?? state,
      projection.$init?.()
    )
}

/**
 * the "command handler"
 *
 * @param {string} productId
 * @param {string} courseId
 */
const subscribeStudentToCourse = (studentId, courseId) => {
  const decisionModel = numberOfSubscriptions(studentId, courseId)
  if (decisionModel.course >= 2) {
    throw new Error("course is full")
  }
  if (decisionModel.student >= 2) {
    throw new Error("student has already subscribed to the max of 2 courses")
  }

  // success -> student can be subscribed, i.e. a new STUDENT_SUBSCRIBED_TO_COURSE event can be appended
}

// example commands
for (const [studentId, courseId] of [["s1", "c1"], ["s2", "c2"], ["s1", "c2"]]) {
  try {
    subscribeStudentToCourse(studentId, courseId)
    console.log(`successfully subscribed student ${studentId} to course ${courseId}`)
  } catch (e) {
    console.error(`failed to subscribe student ${studentId} to course ${courseId}: ${e.message}`)
  }
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

There are working examples in [JavaScript/TypeScript](https://github.com/sennentech/dcb-event-sourced/tree/main/examples/course-manager-cli) and [PHP](https://github.com/bwaidelich/dcb-example-courses)