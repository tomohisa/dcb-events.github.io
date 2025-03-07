# Dynamic product price validation

The following example showcases a simple application that allows to purchase products, with a twist

## Challenge

The goal is an application that allows customers to purchase products, ensuring that the displayed price is taken into account – if it is valid:

- The product prices that are shown to the customer must be used for processing the order
- If a displayed product price is not/no longer valid, the order must fail
- Product prices can be changed at any time
- If a product price was changed, the previous price(s) must be valid for a configurable grace period

## Traditional approaches

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
// decision models:

const productPrice = (productId) => ({
  initialState: 0,
  handlers: {
    ProductDefined: (state, event) => event.data.price,
  },
  tagFilter: [`product:${productId}`],
})

// command handler:

const orderProduct = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    productPrice: productPrice(command.productId),
  })
  if (state.productPrice !== command.displayedPrice) {
    throw new Error(`invalid price ${command.displayedPrice} for product "${command.productId}"`)
  }
  appendEvent(
    {
      type: "ProductOrdered",
      data: [],
      tags: [],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "ProductDefined",
    data: { productId: "p1", price: 123 },
    tags: ["product:p1"],
  },
  {
    type: "ProductDefined",
    data: { productId: "p2", price: 222 },
    tags: ["product:p2"],
  },
])

// test cases:

test([
  {
    description: "Order product with a displayed price that is not valid",
    test: () => orderProduct({ productId: "p1", displayedPrice: 100 }),
    expectedError: 'invalid price 100 for product "p1"',
  },
  {
    description: "Order product with valid price",
    test: () => orderProduct({ productId: "p1", displayedPrice: 123 }),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 02: Changing product prices

Complexity increases if the product price can be changed and previous prices shall be valid for a specified amount of time:

![dynamic product price example 2](img/dynamic-product-price-02.png)

!!! note

    The `minutesAgo` property of the `event` is a simplification. Typically, a timestamp representing the event's recording time is stored within the event's payload or metadata. This timestamp can be compared to the current date to determine the event's age in the decision model.

```js
// decision models:

const productPrice = (productId) => ({
  initialState: { basePrice: null, validPrices: [] },
  handlers: {
    ProductDefined: (state, event) => ({
      ...state,
      basePrice: event.data.price,
      validPrices: event.minutesAgo <= 10 ? [event.data.price] : [],
    }),
    ProductPriceChanged: (state, event) => ({
      ...state,
      basePrice: event.data.newPrice,
      validPrices:
        event.minutesAgo <= 10 ? [...state.validPrices, event.data.newPrice] : state.validPrices,
    }),
  },
  tagFilter: [`product:${productId}`],
})

// command handler:

const orderProduct = (command) => {
  const { state, appendCondition } = buildDecisionModel({
    productPrice: productPrice(command.productId),
  })
  if (state.productPrice.basePrice === null) {
    throw new Error(`unknown product id "${command.productId}"`)
  }
  if (
    state.productPrice.basePrice !== command.displayedPrice &&
    !state.productPrice.validPrices.includes(command.displayedPrice)
  ) {
    throw new Error(`invalid price ${command.displayedPrice} for product "${command.productId}"`)
  }
  appendEvent(
    {
      type: "ProductOrdered",
      data: [],
      tags: [],
    },
    appendCondition
  )
}

// event fixture:

appendEvents([
  {
    type: "ProductDefined",
    data: { productId: "p1", price: 123 },
    tags: ["product:p1"],
    minutesAgo: 20,
  },
  {
    type: "ProductDefined",
    data: { productId: "p2", price: 222 },
    tags: ["product:p2"],
    minutesAgo: 15,
  },
  {
    type: "ProductPriceChanged",
    data: { productId: "p1", newPrice: 130 },
    tags: ["product:p1"],
    minutesAgo: 9,
  },
  {
    type: "ProductPriceChanged",
    data: { productId: "p1", newPrice: 135 },
    tags: ["product:p1"],
    minutesAgo: 5,
  },
])

// test cases:

test([
  {
    description: "Order unknown product",
    test: () => orderProduct({ productId: "p0", displayedPrice: 123 }),
    expectedError: 'unknown product id "p0"',
  },
  {
    description: "Order product with a displayed price that was never valid",
    test: () => orderProduct({ productId: "p1", displayedPrice: 100 }),
    expectedError: 'invalid price 100 for product "p1"',
  },
  {
    description: "Order product with a price that was changed more than 10 minutes ago",
    test: () => orderProduct({ productId: "p1", displayedPrice: 123 }),
    expectedError: 'invalid price 123 for product "p1"',
  },
  {
    description: "Order product with a price that was changed less than 10 minutes ago",
    test: () => orderProduct({ productId: "p1", displayedPrice: 130 }),
  },
  {
    description: "Order product with valid price",
    test: () => orderProduct({ productId: "p1", displayedPrice: 135 }),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 03: Multiple products (shopping cart)

The previous stages could be implemented with a traditional event-sourced [Aggregate](../glossary.md#aggregate) in theory.
But with the requirement to be able to order multiple products at once with a dynamic price, the flexibility of DCB shines:

```js
// decision models:

const productPrice = (productId) => ({
  initialState: { basePrice: null, validPrices: [] },
  handlers: {
    ProductDefined: (state, event) => ({
      ...state,
      basePrice: event.data.price,
      validPrices: event.minutesAgo <= 10 ? [event.data.price] : [],
    }),
    ProductPriceChanged: (state, event) => ({
      ...state,
      basePrice: event.data.newPrice,
      validPrices:
        event.minutesAgo <= 10 ? [...state.validPrices, event.data.newPrice] : state.validPrices,
    }),
  },
  tagFilter: [`product:${productId}`],
})

// command handler:

const orderProducts = (command) => {
  const { state, appendCondition } = buildDecisionModel(
    command.cart.reduce((models, cartItem) => {
      models[cartItem.productId] = productPrice(cartItem.productId)
      return models
    }, {})
  )
  for (const cartItem of command.cart) {
    if (state[cartItem.productId].basePrice === null) {
      throw new Error(`unknown product id "${cartItem.productId}"`)
    }
    if (
      state[cartItem.productId].basePrice !== cartItem.displayedPrice &&
      !state[cartItem.productId].validPrices.includes(cartItem.displayedPrice)
    ) {
      throw new Error(
        `invalid price ${cartItem.displayedPrice} for product "${cartItem.productId}"`
      )
    }
  }
  appendEvent({ type: "ProductsOrdered" /* ... */ }, appendCondition)
}

// event fixture:

appendEvents([
  {
    type: "ProductDefined",
    data: { productId: "p1", price: 123 },
    tags: ["product:p1"],
    minutesAgo: 20,
  },
  {
    type: "ProductDefined",
    data: { productId: "p2", price: 222 },
    tags: ["product:p2"],
    minutesAgo: 15,
  },
  {
    type: "ProductPriceChanged",
    data: { productId: "p1", newPrice: 130 },
    tags: ["product:p1"],
    minutesAgo: 9,
  },
  {
    type: "ProductPriceChanged",
    data: { productId: "p1", newPrice: 135 },
    tags: ["product:p1"],
    minutesAgo: 5,
  },
])

// test cases:

test([
  {
    description: "Order unknown product",
    test: () => orderProducts({ cart: [{ productId: "p0", displayedPrice: 123 }] }),
    expectedError: 'unknown product id "p0"',
  },
  {
    description: "Order product with a displayed price that was never valid",
    test: () => orderProducts({ cart: [{ productId: "p1", displayedPrice: 100 }] }),
    expectedError: 'invalid price 100 for product "p1"',
  },
  {
    description: "Order product with a price that was changed more than 10 minutes ago",
    test: () => orderProducts({ cart: [{ productId: "p1", displayedPrice: 123 }] }),
    expectedError: 'invalid price 123 for product "p1"',
  },
  {
    description: "Order product with a price that was changed less than 10 minutes ago",
    test: () => orderProducts({ cart: [{ productId: "p1", displayedPrice: 130 }] }),
  },
  {
    description: "Order multiple products with valid prices",
    test: () =>
      orderProducts({
        cart: [
          { productId: "p1", displayedPrice: 135 },
          { productId: "p2", displayedPrice: 222 },
        ],
      }),
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>