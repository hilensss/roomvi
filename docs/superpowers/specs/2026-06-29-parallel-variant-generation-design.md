# Parallel Variant Generation Design

## Goal

Reduce the duration of a four-variant generation job by running up to two AI
provider calls concurrently. The concurrency limit must be a single constant so
it can later be raised from two to four.

## Current behavior

`GenerationProcessingService` prepares a product set, builds its prompts, calls
the AI provider, and waits for the result before starting the next variant. A
registered user receives four variants, so four long-running provider calls are
currently serialized. Guest jobs continue to generate one variant.

## Design

The worker will split processing into two phases:

1. Prepare variant plans sequentially. Each plan contains its variant number,
   selected products, prompt, and negative prompt. Sequential preparation
   preserves the existing `usedProductIds` exclusion behavior between product
   sets.
2. Execute prepared plans through a worker pool whose concurrency is controlled
   by one `GENERATION_VARIANT_CONCURRENCY` constant with an initial value of
   `2`. A free worker immediately starts the next plan, so a fast request does
   not wait for the other request in a fixed pair.

Each provider call still requests exactly one design. Generated results retain
their original variant order even when calls finish out of order. DesignVariant
database records continue to be created only after the generation phase has
completed successfully.

## Retry and failure behavior

Each variant gets one initial provider call and up to three additional retries.
Retries remain inside the same pool slot, so retrying cannot increase the
configured concurrency. Retries use exponential backoff and are logged with the
variant number and attempt number.

When a variant exhausts all four attempts, the pool stops assigning new plans,
waits for calls that are already in flight, and throws the terminal error. The
existing outer error handler then marks the GenerationJob as `FAILED` and moves
the RoomProject back to `DRAFT`.

BullMQ remains configured with `attempts: 1`. Retrying the entire queue job
would repeat successful provider calls and could create duplicate external
generations.

## Progress reporting

The worker tracks the latest progress for every active variant and derives job
progress from their aggregate. Progress database writes are serialized and
clamped to the highest previously reported value so concurrent callbacks cannot
move the visible percentage backwards.

The displayed step may identify the variant that emitted the latest update.
The existing final steps (`92%` linking products and `100%` completed/failed)
remain unchanged.

## Testing

Automated worker tests will verify:

- no more than two provider calls are active at once;
- the next variant starts as soon as a pool slot is free;
- output order follows variant order rather than completion order;
- a failed call receives three retries without repeating successful calls;
- exhausting retries fails the complete job only after in-flight work settles;
- reported progress does not decrease under concurrent callbacks.

Worker build and typecheck remain the final project checks for the affected
application.
