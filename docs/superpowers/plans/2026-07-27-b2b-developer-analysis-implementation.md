# B2B Developer Floor-Plan Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox checkpoints and follow test-driven development.

**Goal:** Deliver the first complete developer-project milestone: create a developer project, upload a floor plan, analyze it asynchronously through a reusable OpenAI reasoning module, persist editable room geometry/openings, and let a manager review and confirm the rooms.

**Architecture:** Extend the existing B2B aggregate without changing furniture-project contracts. Add a dedicated BullMQ analysis job. The worker owns the provider-neutral reasoning infrastructure and floor-plan interpretation; the API owns state transitions, persistence, revision-safe edits, and confirmation. The web route remains `/manager/projects/:id` and delegates to a type-specific workspace.

**Tech stack:** NestJS 11, Prisma/PostgreSQL, BullMQ, native `fetch` against OpenAI Responses API, Sharp, Next.js 16, React Query, Vitest, Node test runner.

---

## Task 1: Add the developer floor-plan domain

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260727150000_b2b_developer_floor_plan/migration.sql`
- Modify: `packages/database/src/index.ts` only if new generated exports are not already re-exported

### Steps

- [ ] Add a schema guard test to `apps/api/test/b2b-developer-schema.test.mjs` that reads `schema.prisma` and asserts:
  - `DEVELOPER_FLOOR_PLAN`, `B2B_DEVELOPER_ROOM`;
  - `ANALYZING`, `REVIEW_REQUIRED`, `PARTIALLY_COMPLETED`;
  - `B2BRoom`, `B2BRoomOpening`, and `FloorPlanAnalysisRun`;
  - optional `B2BProject.supplierId` and `roomType`;
  - `roomsRevision` and `defaultCeilingHeightCm`.
- [ ] Run `npm test -w api -- --test-name-pattern="developer floor-plan schema"` and confirm the test fails because the schema is missing.
- [ ] Extend Prisma with:

```prisma
enum B2BRoomStatus {
  DETECTED
  REVIEW_REQUIRED
  READY_TO_GENERATE
  GENERATING
  GENERATED
  FAILED
  SKIPPED
}

enum B2BOpeningKind {
  WINDOW
  DOOR
}

enum B2BAnalysisStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

- [ ] Add `DEVELOPER_FLOOR_PLAN` to `B2BProjectType`, `B2B_DEVELOPER_ROOM` to `GenerationScenario`, and the developer statuses to `B2BProjectStatus`.
- [ ] Make `supplierId`, `supplier`, and `roomType` optional on `B2BProject`. Add `sourcePlanFileId`, `sourcePlanPreviewUrl`, `defaultCeilingHeightCm @default(270)`, `roomsRevision @default(0)`, `rooms`, and `analysisRuns`.
- [ ] Add `B2BRoom`, `B2BRoomOpening`, and `FloorPlanAnalysisRun` exactly as defined by the approved design. Keep `polygon` as JSON with normalized page coordinates and keep openings as separate rows.
- [ ] Add nullable `b2bRoomId` to `GenerationJob` for the next generation milestone.
- [ ] Write a backward-compatible SQL migration. Existing furniture rows retain non-null supplier/room type values.
- [ ] Run `npm run db:generate`, then rerun the schema test and `npm run typecheck`.

## Task 2: Add a separate floor-plan analysis queue

**Files:**

- Modify: `packages/shared/src/queues/generation-queue.constants.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/modules/generation-queue/generation-queue.service.ts`
- Modify: `apps/worker/src/processors/generation.processor.ts`
- Modify: `apps/worker/src/worker.module.ts`

### Steps

- [ ] Add `apps/api/test/floor-plan-analysis-queue.test.mjs`. It imports the built shared constants and API queue service and asserts that `enqueueFloorPlanAnalysis(analysisRunId)` enqueues `ANALYZE_FLOOR_PLAN` with `{ analysisRunId }`, bounded retries, exponential backoff, and the same retention policy as generation.
- [ ] Run the focused API test and confirm it fails because the method and constant do not exist.
- [ ] Add:

```ts
export const GENERATION_QUEUE_JOBS = {
  PROCESS_GENERATION: 'process-generation',
  ANALYZE_FLOOR_PLAN: 'analyze-floor-plan',
} as const;
```

- [ ] Add the analysis payload and `enqueueFloorPlanAnalysis`.
- [ ] Route `ANALYZE_FLOOR_PLAN` in the existing worker processor to a new `FloorPlanAnalysisService`. Unknown jobs must still log and return.
- [ ] Run the focused test and shared/API typechecks.

## Task 3: Implement the provider-neutral reasoning module

**Files:**

- Create: `apps/worker/src/modules/reasoning-ai/reasoning-ai.types.ts`
- Create: `apps/worker/src/modules/reasoning-ai/reasoning-ai-provider.interface.ts`
- Create: `apps/worker/src/modules/reasoning-ai/openai-reasoning.provider.ts`
- Create: `apps/worker/src/modules/reasoning-ai/reasoning-ai.service.ts`
- Create: `apps/worker/src/modules/reasoning-ai/reasoning-ai.module.ts`
- Create: `apps/worker/test/openai-reasoning.provider.test.mjs`
- Modify: `.env.example`

### Steps

- [ ] Write transport-level tests around an injected `fetch` function. Assert that a request:
  - posts to `https://api.openai.com/v1/responses`;
  - uses `gpt-5.6-luna` by default;
  - sends an image as a `data:` URL;
  - requests strict JSON Schema output;
  - uses `reasoning.effort = low`;
  - parses the `output_text` JSON and returns token usage;
  - maps timeout, non-2xx, and invalid JSON to stable provider errors.
- [ ] Run `npm test -w worker -- --test-name-pattern="OpenAI reasoning provider"` and confirm RED.
- [ ] Implement the generic types:

```ts
export type ReasoningAttachment = {
  name: string;
  mimeType: string;
  bytes: Buffer;
};

export type StructuredReasoningRequest = {
  taskName: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  attachments: ReasoningAttachment[];
};
```

- [ ] Implement `OpenAiReasoningProvider` with native `fetch`, `AbortController`, a 60-second default timeout, two attempts for transport/429/5xx failures, no retry for invalid output, and safe errors that never include the API key or attachment bytes.
- [ ] Configure:

```dotenv
OPENAI_API_KEY=
REASONING_AI_MODEL=gpt-5.6-luna
REASONING_AI_REASONING_EFFORT=low
REASONING_AI_TIMEOUT_MS=60000
```

- [ ] Keep provider selection and all OpenAI-specific request details inside `ReasoningAiModule`; floor-plan code imports only `ReasoningAiService`.
- [ ] Run worker tests and typecheck.

## Task 4: Validate and normalize floor-plan proposals

**Files:**

- Create: `apps/worker/src/modules/floor-plan-analysis/floor-plan-analysis.schema.ts`
- Create: `apps/worker/src/modules/floor-plan-analysis/floor-plan-analyzer.service.ts`
- Create: `apps/worker/src/modules/floor-plan-analysis/floor-plan-analysis.module.ts`
- Create: `apps/worker/test/floor-plan-analyzer.service.test.mjs`

### Steps

- [ ] Write tests for a labelled room, an unlabelled room, malformed coordinates, duplicate points, invalid opening segments, out-of-range opening positions, unknown room types, and impossible dimensions.
- [ ] Confirm RED before adding the analyzer.
- [ ] Define a strict schema whose root is `{ rooms: [...] }`; every object sets `additionalProperties: false`, and nullable fields are required but permit `null`.
- [ ] In the prompt, require normalized coordinates, dimensions in centimetres, area in square metres, room-type enum values, and openings referenced by wall segment.
- [ ] Sanitize rather than blindly persist:
  - clamp tiny coordinate rounding drift but reject material out-of-range values;
  - require at least three distinct points;
  - discard invalid openings;
  - map an unsupported or low-confidence room type to `null`;
  - null implausible dimensions/area and append a Russian review note;
  - preserve a usable room when only optional fields are invalid.
- [ ] Return normalized room drafts plus provider/model/usage/warnings metadata.
- [ ] Run focused tests and worker typecheck.

## Task 5: Process and persist an analysis run

**Files:**

- Create: `apps/worker/src/modules/floor-plan-analysis/floor-plan-analysis.service.ts`
- Modify: `apps/worker/src/modules/floor-plan-analysis/floor-plan-analysis.module.ts`
- Modify: `apps/worker/src/processors/generation.processor.ts`
- Modify: `apps/worker/src/worker.module.ts`
- Create: `apps/worker/test/floor-plan-analysis.service.test.mjs`

### Steps

- [ ] Write service tests with fake Prisma, storage fetch, image normalization, and reasoning provider. Assert guarded transitions:
  - `PENDING → PROCESSING → COMPLETED`;
  - project `ANALYZING → REVIEW_REQUIRED`;
  - old draft rooms are replaced atomically;
  - a failed run stores a safe error and project `FAILED`;
  - replaying a completed run is a no-op.
- [ ] Confirm RED.
- [ ] Load the plan asset from the stored URL, normalize raster input with Sharp to a maximum 2400-pixel edge, and reject unsupported MIME types. PDF input returns a clear unsupported-runtime analysis error until a renderer is installed; the API still accepts PDF metadata only after renderer support is present.
- [ ] Call `FloorPlanAnalyzer`, then replace rooms and openings in one transaction. Use project style/default ceiling only at confirmation time; analysis stores detected overrides only.
- [ ] Record provider, model, progress, current step, warnings, and timestamps.
- [ ] Run focused worker tests and worker typecheck.

## Task 6: Add developer project, analysis, review, and confirm APIs

**Files:**

- Modify: `apps/api/src/modules/b2b-projects/dto/create-b2b-project.dto.ts`
- Create: `apps/api/src/modules/b2b-projects/dto/replace-b2b-rooms.dto.ts`
- Modify: `apps/api/src/modules/b2b-projects/b2b-projects.controller.ts`
- Modify: `apps/api/src/modules/b2b-projects/b2b-projects.service.ts`
- Create: `apps/api/test/b2b-developer-projects.service.test.mjs`

### Steps

- [ ] Add tests for type-specific creation, analyze idempotency, detail loading, stale `roomsRevision`, invalid polygons/openings, and confirmation with an unset included-room type.
- [ ] Confirm RED.
- [ ] Make create DTO a validated superset:
  - furniture requires `supplierId` and `roomType`;
  - developer requires `sourceImageUrl`, uses `style`, and defaults ceiling height to 270;
  - reject furniture-only fields on developer creation only where they would be ambiguous.
- [ ] Add service methods:

```ts
startFloorPlanAnalysis(projectId: string): Promise<FloorPlanAnalysisRun>;
replaceRooms(projectId: string, dto: ReplaceB2BRoomsDto): Promise<B2BProject>;
confirmRooms(projectId: string): Promise<B2BProject>;
```

- [ ] `startFloorPlanAnalysis` atomically claims `DRAFT` or `FAILED`, creates one `PENDING` run, sets project `ANALYZING`, and enqueues it after commit. Enqueue failure marks both failed.
- [ ] `replaceRooms` validates normalized polygons/openings, checks `roomsRevision`, replaces the complete draft in a transaction, increments revision, and keeps the project in `REVIEW_REQUIRED`.
- [ ] `confirmRooms` requires at least one included room, known room type, valid polygon/openings, positive dimensions needed by matching, and moves included rooms/project to `READY_TO_GENERATE`.
- [ ] Add:
  - `POST /:id/analyze-floor-plan`
  - `GET /:id/analysis`
  - `PUT /:id/rooms`
  - `POST /:id/rooms/confirm`
- [ ] Keep catalog/product endpoints furniture-only and return `400` for developer projects.
- [ ] Run API tests and typecheck.

## Task 7: Add scenario-specific manager creation and room review

**Files:**

- Modify: `apps/web/features/b2b/model/b2b.types.ts`
- Modify: `apps/web/features/b2b/api/b2b-api.ts`
- Modify: `apps/web/features/b2b/api/b2b-queries.ts`
- Modify: `apps/web/features/b2b/components/create-b2b-project-form.tsx`
- Modify: `apps/web/features/b2b/components/b2b-project-workspace.tsx`
- Create: `apps/web/features/b2b/components/developer-project-workspace.tsx`
- Create: `apps/web/features/b2b/components/floor-plan-room-review.tsx`
- Modify: `apps/web/features/b2b/components/create-b2b-project-form.test.tsx`
- Create: `apps/web/features/b2b/components/developer-project-workspace.test.tsx`
- Create: `apps/web/features/b2b/components/floor-plan-room-review.test.tsx`

### Steps

- [ ] Add failing UI tests for:
  - switching between furniture and developer scenarios;
  - developer form hiding supplier and single-room type;
  - plan upload before create;
  - automatic analysis start;
  - analysis polling/error;
  - selecting a polygon on the plan;
  - editing room type/style/dimensions;
  - moving a polygon vertex through accessible numeric controls;
  - adding/deleting an opening;
  - revision-safe save;
  - confirmation disabled until included rooms are valid.
- [ ] Confirm RED.
- [ ] Extend client types/API/query hooks for analysis and room batch endpoints.
- [ ] Split the current workspace by `project.type`; render the existing furniture UI unchanged.
- [ ] Render the plan as an image with an absolute SVG overlay using the image natural dimensions and a `viewBox="0 0 1 1"`. Use large invisible pointer targets for vertices/openings and visible accessible numeric coordinate controls for keyboard/test operation.
- [ ] Keep local room drafts until save succeeds. On `409`, refetch and show a conflict message instead of overwriting.
- [ ] After developer creation, call analyze and route to the workspace. Poll while `ANALYZING`.
- [ ] Run focused Vitest tests, full web tests, and web typecheck.

## Task 8: Regression, documentation, and checkpoint commit

**Files:**

- Modify: `docs/wiki/b2b-manager-workspace.md`
- Modify: `docs/wiki/domain-model.md`
- Modify: `docs/wiki/backend.md`
- Modify: `docs/wiki/frontend.md`
- Modify: `docs/wiki/generation-flow.md`

### Steps

- [ ] Run:

```bash
npm run db:generate
npm test -w api
npm test -w worker
npm test -w web
npm run typecheck
```

- [ ] Document the reusable `ReasoningAiModule`, `gpt-5.6-luna` default, cost controls, analysis state machine, normalized geometry, revision protection, and the fact that developer generation/export remain the next milestone.
- [ ] Run `graphify update .` because new modules and call paths were added.
- [ ] Inspect `git diff --check`, `git status --short`, and the final diff.
- [ ] Commit only milestone files on `codex/b2b-developer`; do not merge into `main` until verification passes and the user chooses integration.
