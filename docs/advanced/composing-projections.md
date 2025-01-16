## Requirement 1: Enforce unique course ids

```javascript
const events = [
  {
    type: "COURSE_CREATED",
    data: { courseId: "c1", capacity: 10 },
    tags: ["course:c1"],
  }
];

const courseExists = (courseId) => {
  const projection = {
    $init: () => false,
    COURSE_CREATED: () => true,
  };
  return events
    .filter(event => event.tags.includes(`course:${courseId}`))
    .reduce((state, event) =>
      projection[event.type]?.(state, event) ?? state,
      projection.$init?.()
    );
};

for (const courseId of ['c1', 'c2']) {
  console.log(`course "${courseId}" ${courseExists(courseId) ? 'exists' : 'does not exist'}`);
}
```
<codapi-snippet engine="browser" sandbox="javascript"></codapi-snippet>

### Library

(tbd)

```typescript
type Event<TData = any> = {
  type: string;
  data: TData;
  tags?: string[];
};

type Mapping<TState, TEvent extends Event> = {
  $init: () => TState;
  [eventType: string]: ((state: TState, event: TEvent) => TState) | (() => TState);
};

type Projection<TState, TEvent extends Event> = {
  initialState: () => TState | null;
  apply: (state: TState, event: TEvent) => TState;
};

declare function projection<TState, TEvent extends Event>(
  mapping: Mapping<TState, TEvent>,
  tag: string
): Projection<TState, TEvent>;

declare function buildDecisionModel<TProjections extends Record<string, Projection<any, Event>>>(
  projections: TProjections
): {
  [K in keyof TProjections]: ReturnType<TProjections[K]['initialState']>;
};
```

As a result, the example from above can be simplified:

```javascript
const events = [
  {
    type: "COURSE_CREATED",
    data: { courseId: "c1", capacity: 10 },
    tags: ["course:c1"],
  }
];

const courseExists = (courseId) => projection({
  $init: () => false,
  COURSE_CREATED: () => true,
}, `course:${courseId}`);

for (const courseId of ['c1', 'c2']) {
  const decisionModel = buildDecisionModel({
    courseExists: courseExists(courseId)
  })
  console.log(`course "${courseId}" ${decisionModel.courseExists ? 'exists' : 'does not exist'}`);
}
```
<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

## Requirement 2: Respect course capacity

adding a `courseCapacity` projection to keep track of the total capacity of a course:

```javascript
const events = [
  {
    type: "COURSE_CREATED",
    data: { courseId: "c1", capacity: 10 },
    tags: ["course:c1"],
  },
  {
    type: "COURSE_CAPACITY_CHANGED",
    data: { courseId: "c1", newCapacity: 2 },
    tags: ["course:c1"],
  }
];

const courseCapacity = (courseId) => projection({
  $init: () => 0,
  COURSE_CREATED: (_, event) => event.data.capacity,
  COURSE_CAPACITY_CHANGED: (_, event) => event.data.newCapacity,
}, `course:${courseId}`);

const courseId = 'c1';
const decisionModel = buildDecisionModel({
    courseCapacity: courseCapacity(courseId),
})
console.log(`course "${courseId}" has a total capacity of ${decisionModel.courseCapacity}`);
```
<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

adding a `numberOfCourseSubscriptions` projection to keep a count of the subscribed students

```javascript
const events = [
  {
    type: "COURSE_CREATED",
    data: { courseId: "c1", capacity: 10 },
    tags: ["course:c1"],
  },
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
];

const numberOfCourseSubscriptions = (courseId) => projection({
  $init: () => 0,
  STUDENT_SUBSCRIBED_TO_COURSE: (state) => state + 1,
}, `course:${courseId}`);

const courseId = 'c1';
const decisionModel = buildDecisionModel({
    numberOfCourseSubscriptions: numberOfCourseSubscriptions(courseId),
})
console.log(`course "${courseId}" currently has ${decisionModel.numberOfCourseSubscriptions} subscriptions`);
```
<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### Composition

Now those three projections `courseExists`, `courseCapacity` and `numberOfCourseSubscriptions` can be combined to create a single decision model:

```javascript
const events = [
  {
    type: "COURSE_CREATED",
    data: { courseId: "c1", capacity: 10 },
    tags: ["course:c1"],
  },
  {
    type: "COURSE_CREATED",
    data: { courseId: "c2", capacity: 15 },
    tags: ["course:c2"],
  },
  {
    type: "COURSE_CAPACITY_CHANGED",
    data: { courseId: "c1", newCapacity: 2 },
    tags: ["course:c1"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s1", courseId: "c1" },
    tags: ["student:s1", "course:c1"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s1", courseId: "c2" },
    tags: ["student:s1", "course:c2"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s2", courseId: "c1" },
    tags: ["student:s2", "course:c1"],
  },
];

const courseExists = (courseId) => projection({
  $init: () => false,
  COURSE_CREATED: () => true,
}, `course:${courseId}`);

const courseCapacity = (courseId) => projection({
  $init: () => 0,
  COURSE_CREATED: (_, event) => event.data.capacity,
  COURSE_CAPACITY_CHANGED: (_, event) => event.data.newCapacity,
}, `course:${courseId}`);

const numberOfCourseSubscriptions = (courseId) => projection({
  $init: () => 0,
  STUDENT_SUBSCRIBED_TO_COURSE: (state) => state + 1,
}, `course:${courseId}`);

for (const courseId of ['c1', 'c2', 'c3']) {
  const decisionModel = buildDecisionModel({
    courseExists: courseExists(courseId),
    courseCapacity: courseCapacity(courseId),
    numberOfCourseSubscriptions: numberOfCourseSubscriptions(courseId),
  })
  const remainingSeats = decisionModel.courseCapacity - decisionModel.numberOfCourseSubscriptions;
  console.log(`course "${courseId}" (capacity: ${decisionModel.courseCapacity}) ${decisionModel.courseExists ? 'exists' : 'does not exist'} and has ${remainingSeats} seats left`);
}
```
<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

## Requirement 3: Student must not be subscribed to the same course twice

```javascript
const events = [
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s1", courseId: "c1" },
    tags: ["student:s1", "course:c1"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s1", courseId: "c2" },
    tags: ["student:s1", "course:c2"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s2", courseId: "c1" },
    tags: ["student:s2", "course:c1"],
  },
];

const studentSubscriptions = (studentId) => projection({
  $init: () => [],
  STUDENT_SUBSCRIBED_TO_COURSE: (state, event) => [...state, event.data.courseId],
}, `student:${studentId}`);

for (const studentId of ["s1", "s2"]) {
  const decisionModel = buildDecisionModel({
      studentSubscriptions: studentSubscriptions(studentId),
  })
  console.log(`student ${studentId} is subscribed to the courses ${decisionModel.studentSubscriptions}`)
}
```
<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

Finally, everything can be combined to implement a command handler `subscribeStudentToCourse` that enforces all requirements:

```javascript
const events = [
  {
    type: "COURSE_CREATED",
    data: { courseId: "c1", capacity: 10 },
    tags: ["course:c1"],
  },
  {
    type: "COURSE_CREATED",
    data: { courseId: "c2", capacity: 15 },
    tags: ["course:c2"],
  },
  {
    type: "COURSE_CAPACITY_CHANGED",
    data: { courseId: "c1", newCapacity: 2 },
    tags: ["course:c1"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s1", courseId: "c1" },
    tags: ["student:s1", "course:c1"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s1", courseId: "c2" },
    tags: ["student:s1", "course:c2"],
  },
  {
    type: "STUDENT_SUBSCRIBED_TO_COURSE",
    data: { studentId: "s2", courseId: "c1" },
    tags: ["student:s2", "course:c1"],
  },
];

const courseExists = (courseId) => projection({
  $init: () => false,
  COURSE_CREATED: () => true,
}, `course:${courseId}`);

const courseCapacity = (courseId) => projection({
  $init: () => 0,
  COURSE_CREATED: (_, event) => event.data.capacity,
  COURSE_CAPACITY_CHANGED: (_, event) => event.data.newCapacity,
}, `course:${courseId}`);

const numberOfCourseSubscriptions = (courseId) => projection({
  $init: () => 0,
  STUDENT_SUBSCRIBED_TO_COURSE: (state) => state + 1,
}, `course:${courseId}`);

const studentSubscriptions = (studentId) => projection({
  $init: () => [],
  STUDENT_SUBSCRIBED_TO_COURSE: (state, event) => [...state, event.data.courseId],
}, `student:${studentId}`);

const subscribeStudentToCourse = (studentId, courseId) => {
  const decisionModel = buildDecisionModel({
      courseExists: courseExists(courseId),
      courseCapacity: courseCapacity(courseId),
      numberOfCourseSubscriptions: numberOfCourseSubscriptions(courseId),
      studentSubscriptions: studentSubscriptions(studentId),
  })
  if (!decisionModel.courseExists) {
      throw new Error("course not found");
  }
  if (decisionModel.numberOfCourseSubscriptions >= decisionModel.courseCapacity) {
      throw new Error("course is full");
  }
  if (decisionModel.studentSubscriptions.includes(courseId)) {
      throw new Error("already subscribed");
  }
  // TODO publish STUDENT_SUBSCRIBED_TO_COURSE event
}

for (const {studentId,courseId} of [{studentId:"s1", courseId:"c0"},{studentId:"s1", courseId:"c1"},{studentId:"s1", courseId:"c2"},{studentId:"s2", courseId:"c2"}]) {
  console.log(`Subscribing student ${studentId} to course ${courseId}...`)
  try {
    subscribeStudentToCourse(studentId, courseId)
    console.log("success")
  } catch (e) {
    console.log(`Error: ${e.message}\n`)
  }
}
```
<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>