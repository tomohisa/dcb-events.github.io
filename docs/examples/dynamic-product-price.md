# Dynamic product price validation

The following example showcases a simple application that allows to purchase products, with a twist

## Challenge

The goal is an application that allows customers to purchase products, ensuring that the displayed price is taken into account – if it is valid:

- The product prices that are shown to the customer must be used for processing the order
- If a displayed product price is not/no longer valid, the order must fail
- Product prices can be changed at any time
- If a product price was changed, the previous price(s) must be valid for a configurable grace period

## Classic approaches

There are several potential strategies to solve this without DCB:

- For the single product use case an [Aggregate](../glossary.md#aggregate) could be used
    - That only works if product change and -purchase events are stored in the same event stream, which is unlikely to be a good idea
- Use the [Read Model](../glossary.md#read-model) to verify the prices in the command handler
    - That works, but the last requirement (changing prices) forces the model to keep track of historic data even though there might be no (other) use case for it to be kept. A separate, dedicated, model could be created of course but that adds complexity

## DCB approach

With DCB the challenge can be solved without any specific [Tags](../libraries/specification.md#tag) (except for the `product:<id>` tag):

### 01: Single product

If only a single product with a fixed price can be purchased at a time, the implementation is pretty simple:

![dynamic product price example](img/dynamic-product-price-01.png)


```js
// event fixture
const events = [
  {
    type: "PRODUCT_DEFINED",
    data: { id: "p1", price: 123 },
    tags: ["product:p1"],
  },
  {
    type: "PRODUCT_DEFINED",
    data: { id: "p2", price: 222 },
    tags: ["product:p2"],
  },
]

/**
 * the in-memory decision model (aka aggregate)
 *
 * @param {string} productId
 * @returns {number} the price of this product
 */
const productPriceDecisionModel = (productId) => {
  const projection = {
    $init: () => 0,
    PRODUCT_DEFINED: (_, event) => event.data.price,
  }
  return events
    .filter((event) => event.tags.includes(`product:${productId}`))
    .reduce(
      (state, event) => projection[event.type]?.(state, event) ?? state,
      projection.$init?.()
    )
}

/**
 * the "command handler"
 *
 * @param {string} productId
 * @param {number} displayedPrice
 */
const purchaseProduct = (productId, displayedPrice) => {
  const productPrice = productPriceDecisionModel(productId)
  if (productPrice !== displayedPrice) {
    throw new Error(`invalid price ${displayedPrice}`)
  }
  // success -> process purchase...
}

// example commands
for (const displayedPrice of [100, 130, 123]) {
  try {
    purchaseProduct("p1", displayedPrice)
    console.log(`purchase with displayedPrice ${displayedPrice} succeeded`)
  } catch (e) {
    console.error(`purchase with displayedPrice ${displayedPrice} failed: ${e.message}`)
  }
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

### 02: Changing product prices

Complexity increases if the product price can be changed and previous prices shall be valid for a specified amount of time:

![dynamic product price example 2](img/dynamic-product-price-02.png)

```js
// helper function to generate dates X minutes ago
const minutesAgo = (minutes) => new Date(new Date().getTime() - minutes * (1000 * 60))

// event fixture
const events = [
  {
    type: "PRODUCT_DEFINED",
    data: { id: "p1", price: 123 },
    tags: ["product:p1"],
    recordedAt: minutesAgo(20),
  },
  {
    type: "PRODUCT_DEFINED",
    data: { id: "p2", price: 222 },
    tags: ["product:p2"],
    recordedAt: minutesAgo(15),
  },
  {
    type: "PRODUCT_PRICE_CHANGED",
    data: { id: "p1", newPrice: 130 },
    tags: ["product:p1"],
    recordedAt: minutesAgo(9),
  },
  {
    type: "PRODUCT_PRICE_CHANGED",
    data: { id: "p1", newPrice: 135 },
    tags: ["product:p1"],
    recordedAt: minutesAgo(5),
  },
]

/**
 * the in-memory decision model (aka aggregate)
 *
 * @param {string} productId
 * @returns {Object{basePrice: number|null, validPrices: number[]}}
 */
const productPriceDecisionModel = (productId) => {
  // helper function to calculate the age of an event in minutes
  const eventAgeInMinutes = (event) => (new Date() - event.recordedAt) / (1000 * 60)

  // number of minutes before a changed product price is enforced
  const priceGracePeriodInMinutes = 10
  const projection = {
    $init: () => ({ basePrice: null, validPrices: [] }),
    PRODUCT_DEFINED: (state, event) => ({
      ...state,
      basePrice: event.data.price,
      validPrices: eventAgeInMinutes(event) <= priceGracePeriodInMinutes ? [event.data.price] : [],
    }),
    PRODUCT_PRICE_CHANGED: (state, event) => ({
      ...state,
      basePrice: event.data.newPrice,
      validPrices:
        eventAgeInMinutes(event) <= priceGracePeriodInMinutes
          ? [...state.validPrices, event.data.newPrice]
          : state.validPrices,
    }),
  }
  return events
    .filter((event) => event.tags.includes(`product:${productId}`))
    .reduce(
      (state, event) => projection[event.type]?.(state, event) ?? state,
      projection.$init?.()
    )
}

/**
 * the "command handler"
 *
 * @param {string} productId
 * @param {number} displayedPrice
 */
const purchaseProduct = (productId, displayedPrice) => {
  const productPrice = productPriceDecisionModel(productId)
  if (
    productPrice.basePrice !== displayedPrice &&
    !productPrice.validPrices.includes(displayedPrice)
  ) {
    throw new Error(`invalid price ${displayedPrice}`)
  }
  // success -> process purchase...
}

// example commands
for (const displayedPrice of [100, 130, 135]) {
  try {
    purchaseProduct("p1", displayedPrice)
    console.log(`purchase with displayedPrice ${displayedPrice} succeeded`)
  } catch (e) {
    console.error(`purchase with displayedPrice ${displayedPrice} failed: ${e.message}`)
  }
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>

### 03: Multiple products (shopping cart)

The previous stages could be implemented with a classic event-sourced [Aggregate](../glossary.md#aggregate) in theory.
But with the requirement to be able to order multiple products at once with a dynamic price, the flexibility of DCB shines:

```js
// helper function to generate dates X minutes ago
const minutesAgo = (minutes) => new Date(new Date().getTime() - minutes * (1000 * 60))

// event fixture
const events = [
  {
    type: "PRODUCT_DEFINED",
    data: { id: "p1", price: 123 },
    tags: ["product:p1"],
    recordedAt: minutesAgo(20),
  },
  {
    type: "PRODUCT_DEFINED",
    data: { id: "p2", price: 222 },
    tags: ["product:p2"],
    recordedAt: minutesAgo(15),
  },
  {
    type: "PRODUCT_PRICE_CHANGED",
    data: { id: "p1", newPrice: 130 },
    tags: ["product:p1"],
    recordedAt: minutesAgo(9),
  },
  {
    type: "PRODUCT_PRICE_CHANGED",
    data: { id: "p1", newPrice: 135 },
    tags: ["product:p1"],
    recordedAt: minutesAgo(5),
  },
]

/**
 * the in-memory decision model (aka aggregate)
 *
 * @param {string[]} productIds
 * @returns {Object.<string, {basePrice: number|null, validPrices: number[]}>}
 */
const productPriceDecisionModel = (productIds) => {
  // helper function to calculate the age of an event in minutes
  const eventAgeInMinutes = (event) => (new Date() - event.recordedAt) / (1000 * 60)

  // number of minutes before a changed product price is enforced
  const priceGracePeriodInMinutes = 10
  const projection = {
    $init: () => ({}),
    PRODUCT_DEFINED: (state, event) => ({
      ...state,
      [event.data.id]: {
        basePrice: event.data.price,
        validPrices:
          eventAgeInMinutes(event) <= priceGracePeriodInMinutes ? [event.data.price] : [],
      },
    }),
    PRODUCT_PRICE_CHANGED: (state, event) => ({
      ...state,
      [event.data.id]: {
        basePrice: event.data.newPrice,
        validPrices:
          eventAgeInMinutes(event) <= priceGracePeriodInMinutes
            ? [...state[event.data.id].validPrices, event.data.newPrice]
            : state[event.data.id].validPrices,
      },
    }),
  }
  return events
    .filter((event) => productIds.some((productId) => event.tags.includes(`product:${productId}`)))
    .reduce((state, event) => projection[event.type]?.(state, event) ?? state, projection.$init?.())
}

/**
 * the "command handler"
 *
 * @param {Object.<string, number>} cart - Cart object mapping product IDs to their displayed price
 */
const purchaseProducts = (cart) => {
  const productPrices = productPriceDecisionModel(Object.keys(cart))
  for (const [productId, displayedPrice] of Object.entries(cart)) {
    if (productPrices[productId] === undefined) {
      throw new Error(`unknown product id ${productId}`)
    }
    if (
      productPrices[productId].basePrice !== displayedPrice &&
      !productPrices[productId].validPrices.includes(displayedPrice)
    ) {
      throw new Error(`invalid price ${displayedPrice} for product "${productId}"`)
    }
  }
  // success -> process purchase...
}

// example commands
for (const cart of [
  { p0: 123 },
  { p1: 100 },
  { p1: 123, p2: 222 },
  { p1: 130 },
  { p1: 135, p2: 222 },
]) {
  try {
    purchaseProducts(cart)
    console.log(`purchase with cart ${JSON.stringify(cart)} succeeded`)
  } catch (e) {
    console.error(`purchase with cart ${JSON.stringify(cart)} failed: ${e.message}`)
  }
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>