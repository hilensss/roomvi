# B2B Developer Floor Plan Design

Date: 2026-07-27
Status: approved for implementation planning

## 1. Goal

Add the second B2B manager scenario, `DEVELOPER_FLOOR_PLAN`.

A manager uploads one apartment floor plan. The system proposes rooms,
dimensions, room types, wall geometry, windows, and doors. The manager reviews
and corrects the proposal on top of the source plan. The system then produces
one final furnished visualization and a catalog product selection for every
included room.

The developer scenario must not change the Marketplace or furniture-line
behavior.

## 2. Confirmed product decisions

- Input formats: one-page PDF, JPG, JPEG, or PNG.
- One B2B project represents one apartment and one floor plan.
- Analysis is automatic but always followed by manager review.
- Unlabelled rooms receive a suggested type and confidence. A low-confidence
  or unsupported type remains unset until the manager chooses it.
- Room geometry is approximate rather than CAD-grade.
- A window must remain on the correct wall and approximately in the correct
  position in the final visualization.
- The manager can edit room polygon points and add, move, or delete windows and
  doors.
- The project has a default interior style, while every room can override it.
- The project has an editable default ceiling height of 270 cm.
- Every included room produces exactly one final visualization.
- Developer-room generation is always two-stage:
  1. create a reusable empty-room shell from the room geometry;
  2. furnish the shell with automatically matched catalog products.
- There is no direct single-stage generation mode.
- Rooms are independent. One failed room does not cancel completed rooms.
- Export is a ZIP containing the original plan, finished visualizations, and
  an XLSX product-selection workbook.

## 3. Non-goals

The first developer release does not include:

- exact CAD/BIM reconstruction;
- multi-floor or multi-apartment batch upload;
- automatic structural engineering validation;
- centimetre-perfect window placement in generated pixels;
- full wall/door/window drafting tools;
- partner accounts or public project links;
- manual product selection for developer rooms;
- changing the Marketplace product matcher to reasoning-AI matching;
- a B2C reasoning-AI product matching method.

The infrastructure must permit future reasoning-AI use cases, but this release
implements only the floor-plan analysis task.

## 4. End-to-end flow

```text
Manager creates DEVELOPER_FLOOR_PLAN project
  → uploads one plan
  → API stores the private original and enqueues analysis
  → analysis worker normalizes the page
  → FloorPlanAnalyzer calls ReasoningAiService
  → server validates and normalizes structured geometry
  → B2BRoom and B2BRoomOpening drafts are persisted
  → project becomes REVIEW_REQUIRED
  → manager edits the SVG overlay and room fields
  → manager confirms all included rooms
  → API creates one RoomProject + GenerationJob per included B2BRoom
  → each job creates/reuses an empty-room shell
  → product matcher selects catalog products
  → image AI furnishes the shell without changing geometry
  → final DesignVariant and product snapshots are persisted
  → project aggregates room-level statuses
  → manager downloads individual results or builds ZIP/XLSX export
```

Analysis, room generation, and export are asynchronous. HTTP requests validate,
claim state, enqueue work, and return without waiting for external AI or ZIP
creation.

## 5. Reusable reasoning-AI infrastructure

### 5.1. Module boundary

Create a provider-independent `ReasoningAiModule` in the worker application.
It is infrastructure and must not import B2B modules or floor-plan domain
types.

Its responsibilities are:

- provider selection from configuration;
- authenticated provider calls;
- structured-output requests;
- text and file/image attachments;
- timeout and bounded retry policy;
- request correlation and safe observability;
- provider error normalization;
- usage metadata when the provider exposes it.

### 5.2. Interface

The low-level interface is task-agnostic:

```ts
type ReasoningAttachment = {
  name: string;
  mimeType: string;
  bytes: Buffer;
};

type StructuredReasoningRequest = {
  taskName: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  attachments: ReasoningAttachment[];
};

type StructuredReasoningResult = {
  data: unknown;
  provider: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

interface ReasoningAiProvider {
  generateStructured(
    request: StructuredReasoningRequest,
  ): Promise<StructuredReasoningResult>;
}
```

`ReasoningAiService` wraps the configured provider. Domain modules construct
their own prompts and schemas and validate the returned `unknown` value.

### 5.3. Floor-plan consumer

`FloorPlanAnalyzer` is a consumer of `ReasoningAiService`. It owns:

- the floor-plan system prompt;
- the floor-plan JSON schema;
- transformation from provider output into room drafts;
- semantic validation for room types, dimensions, and openings;
- confidence handling and recognition notes.

A future B2C product reasoning service may call the same infrastructure with a
different prompt, schema, and attachments. No B2C method is added now.

## 6. Hybrid floor-plan analysis

### 6.1. Input normalization

The analysis worker produces one canonical page preview:

- honour EXIF orientation for raster images;
- normalize raster dimensions while preserving readable labels;
- render only the first page of a PDF;
- retain the original file unchanged for export;
- store preview width and height for coordinate conversion.

The original and normalized preview are private project assets. Provider input
is supplied as bytes or short-lived signed access rather than a permanent
public plan URL.

### 6.2. Structured AI output

Coordinates use normalized page space: `x` and `y` are in the inclusive range
`0..1`, measured from the top-left corner of the normalized preview.

Each proposed room contains:

```ts
type FloorPlanRoomProposal = {
  sourceLabel: string | null;
  suggestedName: string;
  roomType: RoomType | null;
  polygon: Array<{ x: number; y: number }>;
  widthCm: number | null;
  depthCm: number | null;
  areaM2: number | null;
  ceilingHeightCm: number | null;
  confidence: number;
  notes: string | null;
  openings: Array<{
    kind: 'WINDOW' | 'DOOR';
    wallSegmentIndex: number;
    positionRatio: number;
    widthCm: number | null;
    confidence: number;
  }>;
};
```

`wallSegmentIndex = i` refers to the polygon segment from point `i` to
`(i + 1) % polygon.length`. `positionRatio` is the opening centre along that
segment in the range `0..1`.

### 6.3. Deterministic validation

Provider output is never written directly to Prisma. The analyzer validates:

- known enum values or `null`;
- finite normalized coordinates;
- at least three distinct polygon points;
- polygon and openings inside the page bounds;
- valid wall segment indexes;
- opening ratios inside `0..1`;
- positive, plausible dimensions and area;
- duplicate or near-identical rooms;
- gross mismatch between stated dimensions, stated area, and polygon scale when
  the plan exposes enough measurements to compare them.

Invalid individual fields become `null` or receive a recognition note when the
room can still be reviewed safely. Structurally unusable room proposals are
discarded and recorded in the analysis run error summary.

All successful analyses end in `REVIEW_REQUIRED`, regardless of confidence.

## 7. Domain model

### 7.1. Enum extensions

```text
B2BProjectType:
  FURNITURE_LINE
  DEVELOPER_FLOOR_PLAN

B2BProjectStatus:
  DRAFT
  ANALYZING
  REVIEW_REQUIRED
  READY_TO_GENERATE
  GENERATING
  PARTIALLY_COMPLETED
  COMPLETED
  FAILED

GenerationScenario:
  MARKETPLACE
  B2B_FURNITURE_LINE
  B2B_DEVELOPER_ROOM

B2BRoomStatus:
  DETECTED
  REVIEW_REQUIRED
  READY_TO_GENERATE
  GENERATING
  GENERATED
  FAILED
  SKIPPED

B2BOpeningKind:
  WINDOW
  DOOR

B2BAnalysisStatus:
  PENDING
  PROCESSING
  COMPLETED
  FAILED

B2BExportStatus:
  PENDING
  PROCESSING
  COMPLETED
  FAILED
```

### 7.2. B2BProject changes

Furniture-only fields become optional where required:

```text
supplierId?
roomType?
sourceImageUrl?
```

Developer fields:

```text
sourcePlanFileId?
sourcePlanPreviewFileId?
defaultCeilingHeightCm? default 270
roomsRevision default 0
rooms B2BRoom[]
analysisRuns FloorPlanAnalysisRun[]
exports B2BExport[]
```

`style` remains the project default. Existing furniture rows and API responses
retain their current values and behavior.

The existing project-level `roomProjectId` remains exclusive to
`FURNITURE_LINE`. Developer projects link generation infrastructure through
each `B2BRoom.roomProjectId`; they do not overload the furniture relation.

### 7.3. B2BRoom

```text
id
b2bProjectId
status
sourceLabel?
name
roomType?
styleOverride?
widthCm?
depthCm?
areaM2?
ceilingHeightCm?
polygon Json
recognitionConfidence?
recognitionNotes?
sortOrder
isIncluded
roomProjectId? unique
shellFileId?
shellGeometryFingerprint?
createdAt
updatedAt
```

The effective style is `styleOverride ?? project.style`. The effective ceiling
height is `ceilingHeightCm ?? project.defaultCeilingHeightCm ?? 270`.

### 7.4. B2BRoomOpening

```text
id
b2bRoomId
kind
wallSegmentIndex
positionRatio
widthCm?
recognitionConfidence?
createdAt
updatedAt
```

Openings are separate rows because managers edit them independently and the
server must validate their wall relationship.

### 7.5. FloorPlanAnalysisRun

```text
id
b2bProjectId
status
provider?
model?
progress
currentStep?
errorMessage?
warnings Json?
startedAt?
completedAt?
createdAt
updatedAt
```

Analysis history is retained. Only one active run may claim a project at a
time.

### 7.6. Generation linkage

`GenerationJob` receives an optional `b2bRoomId`. A developer job must have:

```text
scenario = B2B_DEVELOPER_ROOM
requestedVariants = 1
b2bRoomId = confirmed room
```

Every developer `B2BRoom` owns a separate `RoomProject`. Marketplace endpoints,
profiles, carts, and user design selection must continue excluding all B2B
room projects and variants.

### 7.7. Export

`B2BExport` records every export attempt and points to the completed ZIP file.
A failed new attempt does not remove the latest successful export.

## 8. Manager API

All routes use `JwtAuthGuard` and `ManagerGuard`.

```text
POST /manager/b2b-projects
  accepts type-specific create data

POST /manager/b2b-projects/:id/floor-plan
  multipart upload; image or one-page PDF

POST /manager/b2b-projects/:id/analyze-floor-plan
  atomically claims project and enqueues one analysis run

GET /manager/b2b-projects/:id/analysis
  latest analysis progress and error

PUT /manager/b2b-projects/:id/rooms
  replaces the reviewed room draft set using roomsRevision

POST /manager/b2b-projects/:id/rooms/confirm
  validates all included rooms and moves project to READY_TO_GENERATE

POST /manager/b2b-projects/:id/generate
  creates one generation job per included confirmed room

POST /manager/b2b-projects/:id/rooms/:roomId/retry
  retries only the failed/review-required room

GET /manager/b2b-projects/:id/rooms/:roomId/variant/download
  protected final visualization download

POST /manager/b2b-projects/:id/export
  creates a new async export attempt

GET /manager/b2b-projects/:id/export
  latest successful export and current attempt
```

The existing furniture catalog, product replacement, generation, and variant
download contracts remain valid. Type-specific service methods reject routes
that do not match the project type.

Analysis, confirm, generation, retry, and export use guarded status transitions
and transactions so repeated clicks do not create duplicate active work.

`roomsRevision` is returned with project detail and submitted by the review UI.
An update with a stale revision returns `409 Conflict` rather than overwriting
another manager's changes.

## 9. Manager interface

### 9.1. Create project

The create page begins with a scenario choice.

Developer fields:

- project name;
- developer/partner name;
- floor-plan file;
- default style;
- default ceiling height, initially 270 cm;
- internal comment.

Supplier and single room type are not shown for developer projects.

### 9.2. Workspace steps

```text
details
  → upload
  → analysis
  → room review
  → room generation
  → results and export
```

The existing route `/manager/projects/:id` renders a type-specific workspace.
Furniture UI remains unchanged.

### 9.3. Room review

The approved layout is a plan overlay with a side panel:

- source preview and an SVG overlay on the left;
- room polygons, confidence colour, windows, and doors;
- click a room to select it;
- drag polygon vertices;
- enter a simple draw mode to add a missing room polygon;
- add, move, or delete openings on wall segments;
- add or delete a room;
- reorder or exclude a room;
- edit name, type, dimensions, area, and ceiling height;
- select an individual style or inherit the project style;
- display recognition confidence and warnings.

The client edits a local draft and saves the complete reviewed room set through
the revision-protected batch endpoint. “Confirm rooms” remains disabled until
every included room has a valid type, polygon, dimensions required by product
matching, and valid openings.

### 9.4. Generation progress and result

Project progress is room-based:

```text
Готово 3 из 5 комнат
1 комната генерируется
1 комната требует внимания
```

Each room card shows:

- room name, type, and effective style;
- current stage;
- final image when ready;
- selected products and snapshot prices;
- total selection price;
- suppliers and product links;
- image download;
- retry when allowed.

## 10. Developer-room generation

### 10.1. Scenario isolation

Refactor worker input preparation into scenario handlers:

```text
MarketplaceScenarioHandler
FurnitureLineScenarioHandler
DeveloperRoomScenarioHandler
```

Shared orchestration continues owning:

- generation progress persistence;
- provider retry policy;
- provider calls;
- image persistence;
- `DesignVariant` creation;
- product snapshots and links;
- final job status.

Handlers own scenario-specific validation, variant count, product selection, and
prompt/reference preparation. New developer behavior must not be implemented as
conditions scattered through `GenerationProcessingService`.

### 10.2. Stage 1: empty-room shell

`RoomGeometryRenderer` produces an annotated room-level structural reference
from the confirmed room:

- room polygon only, not the complete apartment;
- walls labelled by segment index;
- wall lengths when known;
- windows and doors marked on their wall;
- effective ceiling height;
- a deterministic suggested camera wall without an opening.

The image provider receives the structural reference and a geometry prompt. It
creates one empty, style-neutral room shell. The prompt requires:

- correct wall topology;
- the window on the stated wall and approximate position;
- the door on the stated wall;
- realistic scale;
- no furniture or decorative objects.

The shell is an internal file, not an exported final result.

A geometry fingerprint covers polygon points, openings, dimensions, ceiling
height, room type, and camera wall. A shell is reusable only when its fingerprint
matches the confirmed room geometry.

### 10.3. Stage 2: furnishing

After the shell exists:

1. `ProductMatchingService` builds one coherent product set using room type,
   effective style, dimensions, availability, and AI eligibility.
2. Product reference images are normalized through the existing reference
   cache.
3. The shell is the primary source image; product images are references.
4. The image prompt requires preserving walls, windows, doors, camera, and
   perspective while furnishing the room.
5. Exactly one final image is accepted.
6. `DesignVariant` and `DesignVariantProduct` rows are created from the matched
   products and snapshots.

If no coherent catalog set exists, the room becomes `REVIEW_REQUIRED` or
`FAILED` with a reviewable message. An empty or invented product selection is
not persisted.

### 10.4. Retry rules

- Stage-1 failure: retry starts by recreating the shell.
- Stage-2 failure with a matching shell fingerprint: retry reuses the shell.
- A geometry change invalidates the previous shell.
- A product or style retry may reuse the shell because the shell is
  style-neutral.
- A completed room is never recreated when another room is retried.

### 10.5. Project aggregation

After every room transition, one aggregation service derives project status:

- any active room → `GENERATING`;
- all included rooms generated → `COMPLETED`;
- generated plus failed/review-required rooms → `PARTIALLY_COMPLETED`;
- no generated rooms and terminal failures → `FAILED`;
- confirmed rooms before jobs → `READY_TO_GENERATE`.

Aggregation is idempotent and based on persisted room state.

## 11. Export

Export is available when at least one included room is `GENERATED`.

```text
<project-slug>.zip
├── floor-plan/
│   └── original-plan.<ext>
├── visualizations/
│   ├── 01-living-room.jpg
│   ├── 02-bedroom.jpg
│   └── 03-kitchen.jpg
└── product-selection.xlsx
```

The workbook contains:

- a project summary sheet;
- one sheet per room;
- all room statuses, including failures and skipped rooms;
- snapshot product title, category, quantity `1`, price, currency, supplier,
  external ID, product URL, image URL, and snapshot date.

Sheet names are sanitized and limited to 31 characters. Monetary values are
numeric. ZIP and XLSX are built from stored snapshots, so later catalog changes
do not alter an export.

## 12. Error handling and idempotency

### Analysis

- Invalid MIME, size, page count, or malformed image is rejected before queueing.
- Provider failure marks the run failed and project `REVIEW_REQUIRED`.
- The manager can retry analysis or create rooms manually.
- Invalid provider JSON is never persisted without validation.

### Review

- Invalid/self-intersecting polygons are rejected.
- An opening with a missing wall segment is rejected.
- Stale `roomsRevision` returns `409`.
- Confirm requires at least one included valid room.

### Generation

- Queue creation is transactional with status claims.
- Repeated generate/retry requests do not create duplicate active jobs.
- Stage and provider errors are stored on the room/job with safe manager copy.
- Successful rooms survive failures elsewhere.
- Product matching never invents missing catalog products.

### Security

- Plans and shells are private project assets.
- Only `MANAGER` and `ADMIN` can read developer project details and downloads.
- External provider logs must not contain plan bytes, signed URLs, raw provider
  payloads, or secrets.
- Public Marketplace APIs continue filtering out B2B projects and variants.

## 13. Testing

### Database and API

- migration defaults and furniture-row backward compatibility;
- type-specific create/update validation;
- manager authorization;
- plan upload MIME/size/page constraints;
- analysis idempotency and status transitions;
- structured room validation;
- revision conflict;
- room confirmation;
- one job per included room;
- room-only retry;
- project aggregation;
- protected downloads;
- export eligibility and history.

### Reasoning and analysis

- provider adapter contract with mocked transport;
- strict schema request construction;
- invalid JSON and timeout handling;
- normalized coordinate validation;
- wall/opening index validation;
- dimensions and area plausibility;
- labelled and unlabelled plan fixtures;
- the supplied 2026-07-27 sample plan as a non-network fixture.

Tests do not assert that an external model always returns identical room types.
They assert the contract, validation, persistence, and fallback behavior.

### Worker generation

- scenario resolver preserves Marketplace and furniture behavior;
- developer jobs require exactly one variant and a B2B room;
- shell prompt/reference generation;
- shell fingerprint reuse and invalidation;
- automatic matching and snapshots;
- stage-1 and stage-2 retry boundaries;
- no duplicate variants;
- independent room failure and aggregation.

### Web

- scenario-specific project creation;
- analysis polling and error state;
- SVG selection and polygon editing;
- opening add/move/delete;
- field validation and style inheritance;
- revision conflict recovery;
- room confirmation;
- multi-room progress;
- per-room retry and product results;
- export state.

Production smoke testing uses a small manager-only fixture project and is not
part of deterministic CI.

## 14. Delivery sequence

Implementation is split into working vertical slices:

1. schema, developer project creation, private plan upload;
2. reusable `ReasoningAiModule`, analysis queue, and persisted room drafts;
3. room review UI and confirmation;
4. scenario-handler refactor and two-stage developer-room generation;
5. room result/retry aggregation;
6. ZIP/XLSX export;
7. full regression, documentation, and Graphify update.

Each slice must preserve the furniture scenario and Marketplace test suites.
