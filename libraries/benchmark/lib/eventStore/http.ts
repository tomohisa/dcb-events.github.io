import http from "k6/http"
import { URL } from "https://jslib.k6.io/url/1.0.0/index.js"
import { EventStore, Query, Event, AppendCondition, ReadOptions, SequencedEvent } from "../types.js"

export const createHttpApi = (hostName: string): EventStore => {
  return {
    read(query: Query, options?: ReadOptions): SequencedEvent[] {
      const url = new URL(`https://${hostName}/read`)
      url.searchParams.append("query", JSON.stringify(query))
      if (options !== undefined) {
        url.searchParams.append("options", JSON.stringify(options))
      }

      const response = http.get(url.toString())
      if (response.status !== 200) {
        throw new Error(`Failed to read events: ${response.status} ${response.body}`)
      }
      const responseData = response.json() as SequencedEvent[]
      // TODO verify response data structure
      if (!Array.isArray(responseData) || !responseData.every((event) => typeof event === "object" && typeof event.type === "string" && Array.isArray(event.tags) && typeof event.position === "number")) {
        throw new Error(`Invalid response data: ${JSON.stringify(responseData)}`)
      }
      return responseData
    },
    readLastEvent(query: Query): SequencedEvent | null {
      const events = this.read(query, { backwards: true, limit: 1 })
      return events[0] ?? null
    },
    append(events: Event[], condition?: AppendCondition) {
      const response = http.post(`https://${hostName}/append`, JSON.stringify({ events, condition }), {
        headers: {
          "Content-Type": "application/json",
        },
      })
      if (response.status !== 200) {
        throw new Error(`Failed to append events: ${response.status} ${response.body}`)
      }
      const responseData = response.json() as { durationInMicroseconds: number; appendConditionFailed: boolean }
      if (!responseData || typeof responseData !== "object" || typeof responseData.durationInMicroseconds !== "number" || typeof responseData.appendConditionFailed !== "boolean") {
        throw new Error(`Invalid response data: ${JSON.stringify(responseData)}`)
      }
      return responseData
    },
  }
}
