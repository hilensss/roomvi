# Aggregated Generation Progress Design

## Goal

Make `GenerationJob.progress` monotonic and `GenerationJob.currentStep` stable
while design variants are generated concurrently. Provider-specific progress
remains available for opt-in debugging but is never exposed as the public job
step.

## Scope

The change is centered in
`apps/worker/src/modules/generation-processing/generation-processing.service.ts`.
The provider contract and retry/concurrency behavior remain unchanged. An
exhausted retry for any variant still fails the entire generation job.

## Progress state

After `variantsCount` is known, the service creates one state entry for every
variant:

```ts
type VariantProgressState = {
  progress: number;
  status:
    | 'pending'
    | 'creating'
    | 'queued'
    | 'generating'
    | 'ready'
    | 'saving'
    | 'failed';
  externalJobId?: string;
};
```

Provider progress is clamped to `0..100` and cannot decrease within a variant.
Provider step text is normalized into the status values above. Unknown steps
are treated as `generating`. A successful provider result forces the variant to
`progress: 100` and `status: 'ready'`; an exhausted retry marks it `failed`
before the existing whole-job failure path runs.

## Public progress

Pre-generation and persistence phases use explicit values and public labels:

- `8`: `Подбираем товары из каталога`
- `12`: `Готовим AI-промпты`
- `90`: `Сохраняем варианты дизайна`
- `94`: `Связываем дизайн с товарами`
- `100`: `Готово`

During AI generation, the service averages progress across all requested
variants and maps the result into the inclusive `12..88` range. The persisted
value is rounded to an integer and never decreases relative to the last queued
database update.

The public generation step is derived only from aggregate state:

- while generation is active: `Генерируем варианты интерьера: готово N из M`;
- when all variants are ready: `Сохраняем варианты дизайна`.

Provider text such as `YES AI генерирует вариант 1` is never persisted in
`currentStep`.

## Database update coordination

Concurrent callbacks update their in-memory variant entry synchronously and
then request an aggregate save. Database writes remain serialized so an older
write cannot finish after and overwrite a newer one.

Non-forced aggregate updates are limited to at most one write every two
seconds. A write is skipped when neither public progress nor public step has
changed. Major phase transitions and successful variant completion use forced
saves so completed counts are visible immediately. The most recently reported
non-empty provider job ID is retained in memory and included in the next
persisted aggregate update.

## Logging

`logger.log` is reserved for major lifecycle events: loading and starting the
job, preparing product sets, starting generation, completing a variant,
creating persisted variants, and completing the job.

Per-provider progress and database progress-write details are emitted only via
`logger.debug` when `GENERATION_VERBOSE_LOGS=true`. Verbose logging is disabled
by default.

## Error handling

The existing bounded concurrency and retry policy are preserved. When a
variant exhausts its retries, its aggregate state becomes `failed`; after
in-flight workers settle, the existing error path marks the generation job
`FAILED`. Successful variants are not persisted as a partially completed job.

## Tests

Black-box worker service tests will verify:

- persisted numeric progress never decreases under interleaved callbacks;
- only the approved public `currentStep` values are persisted;
- completion labels advance by aggregate completed count, independent of
  callback order;
- provider callback bursts do not produce one database write per callback;
- successful completion still reaches `90`, `94`, and `100`;
- existing concurrency, ordering, retry, and whole-job failure behavior remains
  intact.
