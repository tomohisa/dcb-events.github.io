import { fail } from "k6"
import { EventStore, Query, QueryItem } from "./types"
import { URL } from "https://jslib.k6.io/url/1.0.0/index.js"
import { createHttpApi } from "./eventStore/http.ts"
import { createGrpcApi } from "./eventStore/grpc.ts"

export function generateStrings(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
}

export function either<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

export function some<T>(array: T[], n: number): T[] {
  return [...array].sort(() => Math.random() - 0.5).slice(0, n)
}

export function between(range: { min: number; max: number }): number {
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min
}

export const QueryBuilder = {
  all(): Query {
    return { items: [] }
  },
  fromItems(items: QueryItem[]): Query {
    return { items }
  },
}

export function createApi(dcbEndpoint: string): EventStore {
  const endpointUrl = new URL(dcbEndpoint)
  if (endpointUrl.protocol === "http:" || endpointUrl.protocol === "https:") {
    return createHttpApi(endpointUrl.host)
  }
  if (endpointUrl.protocol === "grpc:") {
    return createGrpcApi(endpointUrl.host)
  }
  fail(`DCB_ENDPOINT must be an HTTP or gRPC URL, got: ${endpointUrl.protocol}`)
}
