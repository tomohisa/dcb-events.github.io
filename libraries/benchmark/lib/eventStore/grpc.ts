import { Client, Stream, StatusOK } from "k6/net/grpc"
import { b64encode, b64decode } from "k6/encoding"
import { EventStore, Query, Event, AppendCondition, ReadOptions, SequencedEvent } from "../types.js"
import { fail } from "k6"

type DcbdbEvent = {
  eventType: string
  tags: string[]
  data: string
}

type DcbdbSequencedEvent = {
  event: DcbdbEvent
  position: string
}

type DcbdbReadResponse = {
  batch: {
    events: DcbdbSequencedEvent[]
  }
  head: string
}

export const createGrpcApi = (host: string): EventStore => {
  const client = new Client()
  client.load(["lib/eventStore/proto"], "event_store.proto")

  const convertEvent = (event: DcbdbSequencedEvent): SequencedEvent => ({
    type: event.event.eventType,
    tags: event.event.tags,
    data: b64decode(event.event.data, "std", "s"),
    position: parseInt(event.position, 10),
  })

  const connect = () => client.connect(host, { plaintext: true })

  const readEvents = (query: Query, options?: ReadOptions): DcbdbSequencedEvent[] => {
    let readParams: { query: Query; limit?: number; after?: number } = {
      query,
    }
    if (options?.limit) {
      readParams.limit = options.limit
    }
    if (options?.from) {
      readParams.after = options.from - 1
    }
    const response = client.invoke("dcbdb.EventStoreService/Read", readParams)
    if (response.status !== StatusOK) {
      fail(`Failed to read events: ${response.status} ${response.message}`)
    }
    const responseData = response.message as DcbdbReadResponse
    return responseData.batch.events
  }

  return {
    read(query: Query, options?: ReadOptions): SequencedEvent[] {
      connect()
      return readEvents(query, options).map(convertEvent)
    },
    readLastEvent(query: Query): SequencedEvent | null {
      connect()
      const events = readEvents(query)
      if (events.length === 0) {
        return null
      }
      return convertEvent(events[events.length - 1])
    },
    append(events: Event[], condition?: AppendCondition) {
      connect()
      const sT = new Date().getTime() * 1000
      const response = client.invoke("dcbdb.EventStoreService/Append", {
        events: events.map((event) => ({
          event_type: event.type,
          tags: event.tags,
          data: b64encode(event.data),
        })),
        condition: condition
          ? {
              fail_if_events_match: condition.failIfEventsMatch,
              after: condition.after?.toString(),
            }
          : undefined,
      })
      const eT = new Date().getTime() * 1000
      let appendConditionFailed = false
      if (response.status !== StatusOK) {
        if (response.status.toString() === "FailedPrecondition") {
          appendConditionFailed = true
        } else {
          fail(`Failed to append events: ${response.status.toString()} ${response.message}`)
        }
      }
      return {
        durationInMicroseconds: eT - sT,
        appendConditionFailed: appendConditionFailed,
      }
    },
  }
}
