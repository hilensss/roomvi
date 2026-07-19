# B2B Selection Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow 10 manually selected furniture products without a room photo and 9 with a room photo.

**Architecture:** Store an optional `sourceImageUrl` on `B2BProject`, copy it into the shared `RoomProject`, and derive the selection cap from that field at every server and worker validation boundary. Reuse the existing authenticated room-image upload endpoint in the manager form.

**Tech Stack:** Prisma/PostgreSQL, NestJS/class-validator, Next.js/React Query, Vitest, Node test runner.

## Global Constraints

- The cap is exactly 10 without `sourceImageUrl` and exactly 9 with it.
- Both API and worker must enforce the cap independently.
- Marketplace behavior remains unchanged.
- Existing B2B projects remain valid with `sourceImageUrl = null`.

---

### Task 1: Persist the optional room photo

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260719170000_b2b_source_image/migration.sql`
- Modify: `apps/api/src/modules/b2b-projects/dto/create-b2b-project.dto.ts`
- Modify: `apps/api/src/modules/b2b-projects/b2b-projects.service.ts`
- Test: `apps/api/test/b2b-projects.dto-guard.test.mjs`
- Test: `apps/api/test/b2b-projects.service.test.mjs`

**Interfaces:**
- Consumes: `POST /files/upload` response URL.
- Produces: `B2BProject.sourceImageUrl: string | null`.

- [x] **Step 1: Write failing DTO and service tests**

Add a DTO assertion that accepts an HTTPS `sourceImageUrl`. Add service assertions that creation persists the URL and generation copies it into `RoomProject.sourceImageUrl`.

- [x] **Step 2: Verify the tests fail**

Run:

```bash
npm test -w api -- --test-name-pattern='sourceImageUrl|room photo'
```

Expected: the DTO rejects the unknown field or the service does not persist/copy it.

- [x] **Step 3: Add schema, migration, DTO, and service fields**

Add:

```prisma
sourceImageUrl String?
```

Validate it as an optional HTTP/HTTPS URL, persist it during create/update, and set it on both room-project create and retry update.

- [x] **Step 4: Verify API tests pass**

Run the same API test command and expect zero failures.

### Task 2: Enforce the 10/9 API and worker invariant

**Files:**
- Modify: `apps/api/src/modules/b2b-projects/dto/replace-b2b-project-products.dto.ts`
- Modify: `apps/api/src/modules/b2b-projects/b2b-projects.service.ts`
- Modify: `apps/worker/src/modules/generation-processing/generation-processing.service.ts`
- Test: `apps/api/test/b2b-projects.dto-guard.test.mjs`
- Test: `apps/api/test/b2b-projects.service.test.mjs`
- Test: `apps/worker/test/generation-processing.service.test.mjs`

**Interfaces:**
- Consumes: `B2BProject.sourceImageUrl` and `RoomProject.sourceImageUrl`.
- Produces: deterministic `maximumProducts = sourceImageUrl ? 9 : 10`.

- [x] **Step 1: Write failing cap tests**

Cover DTO 10/11, API 10 without photo, API rejection with photo, worker success without photo, and worker rejection with photo.

- [x] **Step 2: Verify cap tests fail**

Run:

```bash
npm test -w api -- --test-name-pattern='1–10|room photo limit'
npm test -w worker -- --test-name-pattern='ten products|room photo'
```

Expected: current six-product checks reject valid inputs or accept the wrong photo case.

- [x] **Step 3: Implement one cap helper per runtime**

Use:

```ts
const maximumProducts = sourceImageUrl ? 9 : 10;
```

Pass the value into API product validation and use it in worker fixed-product validation.

- [x] **Step 4: Verify API and worker tests pass**

Run both focused commands and expect zero failures.

### Task 3: Add manager photo upload and dynamic UI cap

**Files:**
- Modify: `apps/web/features/b2b/api/b2b-api.ts`
- Modify: `apps/web/features/b2b/api/b2b-api.test.ts`
- Modify: `apps/web/features/b2b/model/b2b.types.ts`
- Modify: `apps/web/features/b2b/components/create-b2b-project-form.tsx`
- Modify: `apps/web/features/b2b/components/create-b2b-project-form.test.tsx`
- Modify: `apps/web/features/b2b/components/b2b-project-workspace.tsx`
- Modify: `apps/web/features/b2b/components/b2b-project-workspace.test.tsx`

**Interfaces:**
- Produces: `uploadB2BRoomImage(file): Promise<{ file: UploadedFile }>` and `CreateB2BProjectInput.sourceImageUrl?: string`.
- Consumes: `B2BProject.sourceImageUrl`.

- [x] **Step 1: Write failing form and workspace tests**

Test that the form uploads the chosen file before project creation and that workspace buttons stop at 10 without a photo and 9 with one.

- [x] **Step 2: Verify web tests fail**

Run:

```bash
NEXT_PUBLIC_API_URL=http://api.test npm test -w web -- --run features/b2b
```

Expected: missing upload function/field and the old six-product cap.

- [x] **Step 3: Implement upload and dynamic copy/disabled state**

Add an optional image file input. Upload before `mutateAsync`, pass `sourceImageUrl`, compute `selectionLimit`, and use it in selection count, heading, and disabled logic.

- [x] **Step 4: Verify web tests pass**

Run the focused web command and expect zero failures.

### Task 4: Documentation, full verification, and merge

**Files:**
- Modify: `docs/wiki/b2b-manager-workspace.md`
- Modify: `docs/wiki/api-contracts.md`
- Modify: `docs/wiki/current-state.md`

- [x] **Step 1: Update the documented invariant**

Document 1–10 without a photo, 1–9 with a photo, and the optional `sourceImageUrl`.

- [x] **Step 2: Run full verification**

Run:

```bash
npm test -w api
npm test -w worker
NEXT_PUBLIC_API_URL=http://api.test npm test -w web -- --run
npm run typecheck
DATABASE_URL=postgresql://roomvi:roomvi@localhost:5432/roomvi npx prisma validate --schema packages/database/prisma/schema.prisma
NEXT_PUBLIC_API_URL=http://localhost:4000 DATABASE_URL=postgresql://roomvi:roomvi@localhost:5432/roomvi npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Update Graphify and commit**

Run `graphify update .`, commit the feature branch, then merge it into `main` while preserving the pre-existing dirty main changes.
