import { DcbOptions, Event, Query } from "./types"
import { between, either, generateStrings, some } from "./helpers.ts"

export const fixtureBuilder = (options: DcbOptions) => {
  const eventTypes = generateStrings("eventType", options.numberOfEventTypes)
  const tags = generateStrings("tag", options.numberOfTags)
  return {
    createQuery: (): Query => {
      return {
        items: Array.from({ length: between(options.numberOfItemsPerQuery) }, () => {
          let eventTypesCount = between(options.eventTypesPerQueryItem)
          let tagsCount = between(options.tagsPerQueryItem)
          if (eventTypesCount === 0 && tagsCount === 0) {
            eventTypesCount = between(options.eventTypesPerQueryItem) || 1
            tagsCount = between(options.tagsPerQueryItem) || 1
          }
          let queryItem: { types?: string[]; tags?: string[] } = {}
          if (eventTypesCount > 0) {
            queryItem.types = some(eventTypes, eventTypesCount)
          }
          if (tagsCount > 0) {
            queryItem.tags = some(tags, tagsCount)
          }
          return queryItem
        }),
      }
    },
    createEvents: (query: Query, lastMatchingEventPosition?: number): Event[] => {
      const numberOfEventsInBatch = between(options.eventsPerAppend)
      return Array.from({ length: numberOfEventsInBatch }, (_, i) => {
        const data =
          i === 0
            ? {
                batchIndex: 0,
                batchSize: numberOfEventsInBatch,
                query,
                lastMatchingEventPosition,
              }
            : { batchIndex: i, batchSize: numberOfEventsInBatch }
        return {
          type: either(eventTypes),
          tags: some(tags, between(options.tagsPerQueryItem)),
          data: JSON.stringify(data),
        }
      })
    },
  }
}
