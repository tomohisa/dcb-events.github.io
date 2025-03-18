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

=== "JavaScript"
    ```js
    // event type definitions:
    
    const eventTypes = {
      "CourseDefined": {
        tagResolver: (data) => [`course:${data.courseId}`]
      },
    }
    
    // decision models:
    
    const decisionModels = {
      "courseExists": (courseId) => ({
        initialState: false,
        handlers: {
          CourseDefined: (state, event) => true,
        },
        tagFilter: [`course:${courseId}`],
      }),
    }
    
    // command handlers:
    
    const commandHandlers = {
      "defineCourse": (command) => {
        const { state, appendCondition } = buildDecisionModel({
          courseExists: decisionModels.courseExists(command.courseId),
        })
        if (state.courseExists) {
          throw new Error(`Course with id "${command.courseId}" already exists`)
        }
        appendEvent(
          {
            type: "CourseDefined",
            data: {courseId: command.courseId, capacity: command.capacity},
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
              data: {"courseId":"c1","capacity":10},
            },
          ],
        },
        when: {
          command: {
            type: "defineCourse",
            data: {"courseId":"c1","capacity":15},
          }
        },
        then: {
          expectedError: "Course with id \"c1\" already exists",
        }
      },   {
        description: "Define course with new id",
        when: {
          command: {
            type: "defineCourse",
            data: {"courseId":"c1","capacity":15},
          }
        },
        then: {
          expectedEvent: {
            type: "CourseDefined",
            data: {"courseId":"c1","capacity":15},
          }
        }
      }, 
    ])
    ```
    <codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib-v2.js"></codapi-snippet>

=== "TypeScript (WIP)"
    ??? example "Experimental: 3rd party library"
        This example is based on the unofficial, work-in-progress, [@dcb-es/event-store](https://github.com/sennentech/dcb-event-sourced/wiki){:target="_blank"} package
    ```typescript
    import { Tags, DcbEvent, EventHandlerWithState, buildDecisionModel, EventStore } from "@dcb-es/event-store"
    
    // event type definitions:
    
    export class CourseDefined implements DcbEvent {
      public type: "courseDefined" = "courseDefined"
      public tags: Tags
      public data: { courseId: string; capacity: number }
      public metadata: unknown = {}
    
      constructor({ courseId, capacity }: { courseId: string; capacity: number }) {
        this.tags = Tags.from([`course:${courseId}`])
        this.data = { courseId, capacity }
      }
    }
    
    // decision models:
    
    export const CourseExists = (courseId): EventHandlerWithState<CourseDefined, boolean> => ({
      tagFilter: Tags.from([`course:${courseId}`]),
      init: false,
      when: {
        courseDefined: ({}) => true,
      },
    })
    
    // command handlers:
    
    export class Api {
      private eventStore: EventStore
      constructor(eventStore: EventStore) {
          this.eventStore = eventStore
      }
    
      async defineCourse(command: { courseId: string; capacity: number }) {
        const { state, appendCondition } = await buildDecisionModel(this.eventStore, {
          courseExists: CourseExists(command.courseId),
        })
        if (state.courseExists) throw new Error(`Course with id "${command.courseId}" already exists`)
        await this.eventStore.append(
          new CourseDefined({ courseId: command.courseId, capacity: command.capacity }),
          appendCondition
        )
      }
    }
    ```

=== "GWT (WIP)"
    ??? example "Experimental: 3rd party library"
        This example uses an unofficial, work-in-progress, library to visualize Given/When/Then scenarios
    <dcb-scenario
      style="font-size: xx-small"
      eventDefinitions="[{&quot;name&quot;:&quot;CourseDefined&quot;,&quot;propertyDefinitions&quot;:[{&quot;name&quot;:&quot;courseId&quot;,&quot;type&quot;:&quot;string&quot;,&quot;required&quot;:true},{&quot;name&quot;:&quot;capacity&quot;,&quot;type&quot;:&quot;integer&quot;,&quot;required&quot;:true}],&quot;tagResolvers&quot;:[&quot;course:{data.courseId}&quot;],&quot;icon&quot;:null}]"
      testCases="[{&quot;description&quot;:&quot;Define course with existing id&quot;,&quot;givenEvents&quot;:[{&quot;type&quot;:&quot;CourseDefined&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;capacity&quot;:10},&quot;metadata&quot;:[]}],&quot;whenCommand&quot;:{&quot;type&quot;:&quot;defineCourse&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;capacity&quot;:15}},&quot;thenExpectedEvent&quot;:null,&quot;thenExpectedError&quot;:&quot;Course with id \&quot;c1\&quot; already exists&quot;},{&quot;description&quot;:&quot;Define course with new id&quot;,&quot;givenEvents&quot;:null,&quot;whenCommand&quot;:{&quot;type&quot;:&quot;defineCourse&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;capacity&quot;:15}},&quot;thenExpectedEvent&quot;:{&quot;type&quot;:&quot;CourseDefined&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;capacity&quot;:15},&quot;metadata&quot;:[]},&quot;thenExpectedError&quot;:null}]"></dcb-scenario>

### Feature 2: Change course capacity

The second implementation extends the first by a `changeCourseCapacity` command that allows to change the maximum number of seats for a given course:

=== "JavaScript"
    ```js hl_lines="7-9 22-29 36-46"
    // event type definitions:
    
    const eventTypes = {
      "CourseDefined": {
        tagResolver: (data) => [`course:${data.courseId}`]
      },
      "CourseCapacityChanged": {
        tagResolver: (data) => [`course:${data.courseId}`]
      },
    }
    
    // decision models:
    
    const decisionModels = {
      "courseExists": (courseId) => ({
        initialState: false,
        handlers: {
          CourseDefined: (state, event) => true,
        },
        tagFilter: [`course:${courseId}`],
      }),
      "courseCapacity": (courseId) => ({
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
      "changeCourseCapacity": (command) => {
        const { state, appendCondition } = buildDecisionModel({
          courseExists: decisionModels.courseExists(command.courseId),
          courseCapacity: decisionModels.courseCapacity(command.courseId),
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
            data: {courseId: command.courseId, newCapacity: command.newCapacity},
          },
          appendCondition
        )
      },
    
    }
    
    // test cases:
    
    test([
      {
        description: "Change capacity of a non-existing course",
        when: {
          command: {
            type: "changeCourseCapacity",
            data: {"courseId":"c0","newCapacity":15},
          }
        },
        then: {
          expectedError: "Course \"c0\" does not exist",
        }
      },   {
        description: "Change capacity of a course to a new value",
        given: {
          events: [
            {
              type: "CourseDefined",
              data: {"courseId":"c1","capacity":12},
            },
          ],
        },
        when: {
          command: {
            type: "changeCourseCapacity",
            data: {"courseId":"c1","newCapacity":15},
          }
        },
        then: {
          expectedEvent: {
            type: "CourseCapacityChanged",
            data: {"courseId":"c1","newCapacity":15},
          }
        }
      }, 
    ])
    ```
    <codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib-v2.js"></codapi-snippet>

=== "TypeScript (WIP)"
    ??? example "Experimental: 3rd party library"
        This example is based on the unofficial, work-in-progress, [@dcb-es/event-store](https://github.com/sennentech/dcb-event-sourced/wiki){:target="_blank"} package
    ```typescript
    import { Tags, DcbEvent, EventHandlerWithState, buildDecisionModel, EventStore } from "@dcb-es/event-store"
    
    // event type definitions:
    
    export class CourseDefined implements DcbEvent {
      public type: "courseDefined" = "courseDefined"
      public tags: Tags
      public data: { courseId: string; capacity: number }
      public metadata: unknown = {}
    
      constructor({ courseId, capacity }: { courseId: string; capacity: number }) {
        this.tags = Tags.from([`course:${courseId}`])
        this.data = { courseId, capacity }
      }
    }
    export class CourseCapacityChanged implements DcbEvent {
      public type: "courseCapacityChanged" = "courseCapacityChanged"
      public tags: Tags
      public data: { courseId: string; newCapacity: number }
      public metadata: unknown = {}
    
      constructor({ courseId, newCapacity }: { courseId: string; newCapacity: number }) {
        this.tags = Tags.from([`course:${courseId}`])
        this.data = { courseId, newCapacity }
      }
    }
    
    // decision models:
    
    export const CourseExists = (courseId): EventHandlerWithState<CourseDefined, boolean> => ({
      tagFilter: Tags.from([`course:${courseId}`]),
      init: false,
      when: {
        courseDefined: ({}) => true,
      },
    })
    export const CourseCapacity = (courseId): EventHandlerWithState<CourseDefined | CourseCapacityChanged, number> => ({
      tagFilter: Tags.from([`course:${courseId}`]),
      init: 0,
      when: {
        courseDefined: ({ event }) => event.data.capacity,
        courseCapacityChanged: ({ event }) => event.data.newCapacity,
      },
    })
    
    // command handlers:
    
    export class Api {
      private eventStore: EventStore
      constructor(eventStore: EventStore) {
          this.eventStore = eventStore
      }
    
      async changeCourseCapacity(command: { courseId: string; newCapacity: number }) {
        const { state, appendCondition } = await buildDecisionModel(this.eventStore, {
          courseExists: CourseExists(command.courseId),
          courseCapacity: CourseCapacity(command.courseId),
        })
        if (!state.courseExists) throw new Error(`Course "${command.courseId}" does not exist`)
        if (state.courseCapacity === command.newCapacity) throw new Error(`New capacity ${command.newCapacity} is the same as the current capacity`)
        await this.eventStore.append(
          new CourseCapacityChanged({ courseId: command.courseId, newCapacity: command.newCapacity }),
          appendCondition
        )
      }
    }
    ```

=== "GWT (WIP)"
    ??? example "Experimental: 3rd party library"
        This example uses an unofficial, work-in-progress, library to visualize Given/When/Then scenarios
    <dcb-scenario
      style="font-size: xx-small"
      eventDefinitions="[{&quot;name&quot;:&quot;CourseDefined&quot;,&quot;propertyDefinitions&quot;:[{&quot;name&quot;:&quot;courseId&quot;,&quot;type&quot;:&quot;string&quot;,&quot;required&quot;:true},{&quot;name&quot;:&quot;capacity&quot;,&quot;type&quot;:&quot;integer&quot;,&quot;required&quot;:true}],&quot;tagResolvers&quot;:[&quot;course:{data.courseId}&quot;],&quot;icon&quot;:null},{&quot;name&quot;:&quot;CourseCapacityChanged&quot;,&quot;propertyDefinitions&quot;:[{&quot;name&quot;:&quot;courseId&quot;,&quot;type&quot;:&quot;string&quot;,&quot;required&quot;:true},{&quot;name&quot;:&quot;newCapacity&quot;,&quot;type&quot;:&quot;integer&quot;,&quot;required&quot;:true}],&quot;tagResolvers&quot;:[&quot;course:{data.courseId}&quot;],&quot;icon&quot;:null}]"
      testCases="[{&quot;description&quot;:&quot;Change capacity of a non-existing course&quot;,&quot;givenEvents&quot;:null,&quot;whenCommand&quot;:{&quot;type&quot;:&quot;changeCourseCapacity&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c0&quot;,&quot;newCapacity&quot;:15}},&quot;thenExpectedEvent&quot;:null,&quot;thenExpectedError&quot;:&quot;Course \&quot;c0\&quot; does not exist&quot;},{&quot;description&quot;:&quot;Change capacity of a course to a new value&quot;,&quot;givenEvents&quot;:[{&quot;type&quot;:&quot;CourseDefined&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;capacity&quot;:12},&quot;metadata&quot;:[]}],&quot;whenCommand&quot;:{&quot;type&quot;:&quot;changeCourseCapacity&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;newCapacity&quot;:15}},&quot;thenExpectedEvent&quot;:{&quot;type&quot;:&quot;CourseCapacityChanged&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;newCapacity&quot;:15},&quot;metadata&quot;:[]},&quot;thenExpectedError&quot;:null}]"></dcb-scenario>

### Feature 3: Subscribe student to course

The last implementation contains the core example that requires constraint checks across multiple entities, adding a `subscribeStudentToCourse` command with a corresponding handler that checks...

- ...whether the course with the specified id exists
- ...whether the specified course still has available seats
- ...whether the student with the specified id is not yet subscribed to given course
- ...whether the student is not subscribed to more than 5 courses already

=== "JavaScript"
    ```js hl_lines="10-12 33-53 63-65 70-78"
    // event type definitions:
    
    const eventTypes = {
      "CourseDefined": {
        tagResolver: (data) => [`course:${data.courseId}`]
      },
      "CourseCapacityChanged": {
        tagResolver: (data) => [`course:${data.courseId}`]
      },
      "StudentSubscribedToCourse": {
        tagResolver: (data) => [`student:${data.studentId}`, `course:${data.courseId}`]
      },
    }
    
    // decision models:
    
    const decisionModels = {
      "courseExists": (courseId) => ({
        initialState: false,
        handlers: {
          CourseDefined: (state, event) => true,
        },
        tagFilter: [`course:${courseId}`],
      }),
      "courseCapacity": (courseId) => ({
        initialState: 0,
        handlers: {
          CourseDefined: (state, event) => event.data.capacity,
          CourseCapacityChanged: (state, event) => event.data.newCapacity,
        },
        tagFilter: [`course:${courseId}`],
      }),
      "studentAlreadySubscribed": (studentId, courseId) => ({
        initialState: false,
        handlers: {
          StudentSubscribedToCourse: (state, event) => true,
        },
        tagFilter: [`student:${studentId}`, `course:${courseId}`],
      }),
      "numberOfCourseSubscriptions": (courseId) => ({
        initialState: 0,
        handlers: {
          StudentSubscribedToCourse: (state, event) => state + 1,
        },
        tagFilter: [`course:${courseId}`],
      }),
      "numberOfStudentSubscriptions": (studentId) => ({
        initialState: 0,
        handlers: {
          StudentSubscribedToCourse: (state, event) => state + 1,
        },
        tagFilter: [`student:${studentId}`],
      }),
    }
    
    // command handlers:
    
    const commandHandlers = {
      "subscribeStudentToCourse": (command) => {
        const { state, appendCondition } = buildDecisionModel({
          courseExists: decisionModels.courseExists(command.courseId),
          courseCapacity: decisionModels.courseCapacity(command.courseId),
          numberOfCourseSubscriptions: decisionModels.numberOfCourseSubscriptions(command.courseId),
          numberOfStudentSubscriptions: decisionModels.numberOfStudentSubscriptions(command.studentId),
          studentAlreadySubscribed: decisionModels.studentAlreadySubscribed(command.studentId, command.courseId),
        })
        if (!state.courseExists) {
          throw new Error(`Course "${command.courseId}" does not exist`)
        }
        if (state.numberOfCourseSubscriptions >= state.courseCapacity) {
          throw new Error(`Course "${command.courseId}" is already fully booked`)
        }
        if (state.studentAlreadySubscribed) {
          throw new Error("Student already subscribed to this course")
        }
        if (state.numberOfStudentSubscriptions >= 5) {
          throw new Error("Student already subscribed to 5 courses")
        }
        appendEvent(
          {
            type: "StudentSubscribedToCourse",
            data: {studentId: command.studentId, courseId: command.courseId},
          },
          appendCondition
        )
      },
    
    }
    
    // test cases:
    
    test([
      {
        description: "Subscribe student to non-existing course",
        when: {
          command: {
            type: "subscribeStudentToCourse",
            data: {"studentId":"s1","courseId":"c0"},
          }
        },
        then: {
          expectedError: "Course \"c0\" does not exist",
        }
      },   {
        description: "Subscribe student to fully booked course",
        given: {
          events: [
            {
              type: "CourseDefined",
              data: {"courseId":"c1","capacity":3},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s1","courseId":"c1"},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s2","courseId":"c1"},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s3","courseId":"c1"},
            },
          ],
        },
        when: {
          command: {
            type: "subscribeStudentToCourse",
            data: {"studentId":"s4","courseId":"c1"},
          }
        },
        then: {
          expectedError: "Course \"c1\" is already fully booked",
        }
      },   {
        description: "Subscribe student to the same course twice",
        given: {
          events: [
            {
              type: "CourseDefined",
              data: {"courseId":"c1","capacity":10},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s1","courseId":"c1"},
            },
          ],
        },
        when: {
          command: {
            type: "subscribeStudentToCourse",
            data: {"studentId":"s1","courseId":"c1"},
          }
        },
        then: {
          expectedError: "Student already subscribed to this course",
        }
      },   {
        description: "Subscribe student to more than 5 courses",
        given: {
          events: [
            {
              type: "CourseDefined",
              data: {"courseId":"c6","capacity":10},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s1","courseId":"c1"},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s1","courseId":"c2"},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s1","courseId":"c3"},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s1","courseId":"c4"},
            },
            {
              type: "StudentSubscribedToCourse",
              data: {"studentId":"s1","courseId":"c5"},
            },
          ],
        },
        when: {
          command: {
            type: "subscribeStudentToCourse",
            data: {"studentId":"s1","courseId":"c6"},
          }
        },
        then: {
          expectedError: "Student already subscribed to 5 courses",
        }
      }, 
    ])
    ```
    <codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib-v2.js"></codapi-snippet>

=== "TypeScript (WIP)"
    ??? example "Experimental: 3rd party library"
        This example is based on the unofficial, work-in-progress, [@dcb-es/event-store](https://github.com/sennentech/dcb-event-sourced/wiki){:target="_blank"} package
    ```typescript
    import { Tags, DcbEvent, EventHandlerWithState, buildDecisionModel, EventStore } from "@dcb-es/event-store"
    
    // event type definitions:
    
    export class CourseDefined implements DcbEvent {
      public type: "courseDefined" = "courseDefined"
      public tags: Tags
      public data: { courseId: string; capacity: number }
      public metadata: unknown = {}
    
      constructor({ courseId, capacity }: { courseId: string; capacity: number }) {
        this.tags = Tags.from([`course:${courseId}`])
        this.data = { courseId, capacity }
      }
    }
    export class CourseCapacityChanged implements DcbEvent {
      public type: "courseCapacityChanged" = "courseCapacityChanged"
      public tags: Tags
      public data: { courseId: string; newCapacity: number }
      public metadata: unknown = {}
    
      constructor({ courseId, newCapacity }: { courseId: string; newCapacity: number }) {
        this.tags = Tags.from([`course:${courseId}`])
        this.data = { courseId, newCapacity }
      }
    }
    export class StudentSubscribedToCourse implements DcbEvent {
      public type: "studentSubscribedToCourse" = "studentSubscribedToCourse"
      public tags: Tags
      public data: { studentId: string; courseId: string }
      public metadata: unknown = {}
    
      constructor({ studentId, courseId }: { studentId: string; courseId: string }) {
        this.tags = Tags.from([`student:${studentId}`, `course:${courseId}`])
        this.data = { studentId, courseId }
      }
    }
    
    // decision models:
    
    export const CourseExists = (courseId): EventHandlerWithState<CourseDefined, boolean> => ({
      tagFilter: Tags.from([`course:${courseId}`]),
      init: false,
      when: {
        courseDefined: ({}) => true,
      },
    })
    export const CourseCapacity = (courseId): EventHandlerWithState<CourseDefined | CourseCapacityChanged, number> => ({
      tagFilter: Tags.from([`course:${courseId}`]),
      init: 0,
      when: {
        courseDefined: ({ event }) => event.data.capacity,
        courseCapacityChanged: ({ event }) => event.data.newCapacity,
      },
    })
    export const StudentAlreadySubscribed = (studentId, courseId): EventHandlerWithState<StudentSubscribedToCourse, boolean> => ({
      tagFilter: Tags.from([`student:${studentId}`, `course:${courseId}`]),
      init: false,
      when: {
        studentSubscribedToCourse: ({}) => true,
      },
    })
    export const NumberOfCourseSubscriptions = (courseId): EventHandlerWithState<StudentSubscribedToCourse, number> => ({
      tagFilter: Tags.from([`course:${courseId}`]),
      init: 0,
      when: {
        studentSubscribedToCourse: ({}, state) => state + 1,
      },
    })
    export const NumberOfStudentSubscriptions = (studentId): EventHandlerWithState<StudentSubscribedToCourse, number> => ({
      tagFilter: Tags.from([`student:${studentId}`]),
      init: 0,
      when: {
        studentSubscribedToCourse: ({}, state) => state + 1,
      },
    })
    
    // command handlers:
    
    export class Api {
      private eventStore: EventStore
      constructor(eventStore: EventStore) {
          this.eventStore = eventStore
      }
    
      async subscribeStudentToCourse(command: { studentId: string; courseId: string }) {
        const { state, appendCondition } = await buildDecisionModel(this.eventStore, {
          courseExists: CourseExists(command.courseId),
          courseCapacity: CourseCapacity(command.courseId),
          numberOfCourseSubscriptions: NumberOfCourseSubscriptions(command.courseId),
          numberOfStudentSubscriptions: NumberOfStudentSubscriptions(command.studentId),
          studentAlreadySubscribed: StudentAlreadySubscribed(command.studentId, command.courseId),
        })
        if (!state.courseExists) throw new Error(`Course "${command.courseId}" does not exist`)
        if (state.numberOfCourseSubscriptions >= state.courseCapacity) throw new Error(`Course "${command.courseId}" is already fully booked`)
        if (state.studentAlreadySubscribed) throw new Error("Student already subscribed to this course")
        if (state.numberOfStudentSubscriptions >= 5) throw new Error("Student already subscribed to 5 courses")
        await this.eventStore.append(
          new StudentSubscribedToCourse({ studentId: command.studentId, courseId: command.courseId }),
          appendCondition
        )
      }
    }
    ```

=== "GWT (WIP)"
    ??? example "Experimental: 3rd party library"
        This example uses an unofficial, work-in-progress, library to visualize Given/When/Then scenarios
    <dcb-scenario
      style="font-size: xx-small"
      eventDefinitions="[{&quot;name&quot;:&quot;CourseDefined&quot;,&quot;propertyDefinitions&quot;:[{&quot;name&quot;:&quot;courseId&quot;,&quot;type&quot;:&quot;string&quot;,&quot;required&quot;:true},{&quot;name&quot;:&quot;capacity&quot;,&quot;type&quot;:&quot;integer&quot;,&quot;required&quot;:true}],&quot;tagResolvers&quot;:[&quot;course:{data.courseId}&quot;],&quot;icon&quot;:null},{&quot;name&quot;:&quot;CourseCapacityChanged&quot;,&quot;propertyDefinitions&quot;:[{&quot;name&quot;:&quot;courseId&quot;,&quot;type&quot;:&quot;string&quot;,&quot;required&quot;:true},{&quot;name&quot;:&quot;newCapacity&quot;,&quot;type&quot;:&quot;integer&quot;,&quot;required&quot;:true}],&quot;tagResolvers&quot;:[&quot;course:{data.courseId}&quot;],&quot;icon&quot;:null},{&quot;name&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;propertyDefinitions&quot;:[{&quot;name&quot;:&quot;studentId&quot;,&quot;type&quot;:&quot;string&quot;,&quot;required&quot;:true},{&quot;name&quot;:&quot;courseId&quot;,&quot;type&quot;:&quot;string&quot;,&quot;required&quot;:true}],&quot;tagResolvers&quot;:[&quot;student:{data.studentId}&quot;,&quot;course:{data.courseId}&quot;],&quot;icon&quot;:null}]"
      testCases="[{&quot;description&quot;:&quot;Subscribe student to non-existing course&quot;,&quot;givenEvents&quot;:null,&quot;whenCommand&quot;:{&quot;type&quot;:&quot;subscribeStudentToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c0&quot;}},&quot;thenExpectedEvent&quot;:null,&quot;thenExpectedError&quot;:&quot;Course \&quot;c0\&quot; does not exist&quot;},{&quot;description&quot;:&quot;Subscribe student to fully booked course&quot;,&quot;givenEvents&quot;:[{&quot;type&quot;:&quot;CourseDefined&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;capacity&quot;:3},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c1&quot;},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s2&quot;,&quot;courseId&quot;:&quot;c1&quot;},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s3&quot;,&quot;courseId&quot;:&quot;c1&quot;},&quot;metadata&quot;:[]}],&quot;whenCommand&quot;:{&quot;type&quot;:&quot;subscribeStudentToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s4&quot;,&quot;courseId&quot;:&quot;c1&quot;}},&quot;thenExpectedEvent&quot;:null,&quot;thenExpectedError&quot;:&quot;Course \&quot;c1\&quot; is already fully booked&quot;},{&quot;description&quot;:&quot;Subscribe student to the same course twice&quot;,&quot;givenEvents&quot;:[{&quot;type&quot;:&quot;CourseDefined&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c1&quot;,&quot;capacity&quot;:10},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c1&quot;},&quot;metadata&quot;:[]}],&quot;whenCommand&quot;:{&quot;type&quot;:&quot;subscribeStudentToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c1&quot;}},&quot;thenExpectedEvent&quot;:null,&quot;thenExpectedError&quot;:&quot;Student already subscribed to this course&quot;},{&quot;description&quot;:&quot;Subscribe student to more than 5 courses&quot;,&quot;givenEvents&quot;:[{&quot;type&quot;:&quot;CourseDefined&quot;,&quot;data&quot;:{&quot;courseId&quot;:&quot;c6&quot;,&quot;capacity&quot;:10},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c1&quot;},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c2&quot;},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c3&quot;},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c4&quot;},&quot;metadata&quot;:[]},{&quot;type&quot;:&quot;StudentSubscribedToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c5&quot;},&quot;metadata&quot;:[]}],&quot;whenCommand&quot;:{&quot;type&quot;:&quot;subscribeStudentToCourse&quot;,&quot;data&quot;:{&quot;studentId&quot;:&quot;s1&quot;,&quot;courseId&quot;:&quot;c6&quot;}},&quot;thenExpectedEvent&quot;:null,&quot;thenExpectedError&quot;:&quot;Student already subscribed to 5 courses&quot;}]"></dcb-scenario>

### Other implementations

There is a working [JavaScript/TypeScript](https://github.com/sennentech/dcb-event-sourced/tree/main/examples/course-manager-cli) and [PHP](https://github.com/bwaidelich/dcb-example-courses) implementation