# B2B Furniture Manager Workspace Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the first manager-facing B2B flow: create a furniture visualization project, manually select 1–6 eligible products from one supplier, generate exactly two designs with that unchanged product set, and review/download the results.

**Architecture:** Add an isolated B2B project domain linked to the existing room project and generation pipeline. A generation scenario on each job preserves Marketplace behavior while letting the worker bypass automatic product matching for furniture projects. NestJS owns authorization and business validation; Next.js provides the manager workspace and polls the existing async pipeline.

**Tech Stack:** Prisma/PostgreSQL, NestJS, BullMQ, Node test runner, Next.js 16, React 19, TanStack Query, Vitest/Testing Library.

---

### Task 1: Persist manager roles, B2B projects, and generation scenarios

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260719120000_b2b_furniture_manager/migration.sql`
- Test: `apps/api/test/b2b-projects.dto-guard.test.mjs`

**Steps:**
1. Add a failing API test that imports the new manager guard and verifies `MANAGER` and `ADMIN` access while rejecting `USER`.
2. Run the focused API test and confirm it fails because the B2B types/guard do not exist.
3. Add `MANAGER`, furniture project/status/scenario enums, `B2BProject`, `B2BProjectProduct`, and their relations.
4. Add `scenario` and `requestedVariants` to `GenerationJob`, defaulting existing jobs to Marketplace behavior.
5. Generate the Prisma client and validate the schema.

### Task 2: Implement the furniture B2B API

**Files:**
- Create: `apps/api/src/modules/b2b-projects/b2b-projects.module.ts`
- Create: `apps/api/src/modules/b2b-projects/b2b-projects.controller.ts`
- Create: `apps/api/src/modules/b2b-projects/b2b-projects.service.ts`
- Create: `apps/api/src/modules/b2b-projects/guards/manager.guard.ts`
- Create: `apps/api/src/modules/b2b-projects/dto/*.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/b2b-projects.dto-guard.test.mjs`
- Test: `apps/api/test/b2b-projects.service.test.mjs`

**Steps:**
1. Extend the failing guard/DTO test with accepted and rejected project inputs.
2. Add failing service tests for listing/creating projects, replacing the manual product set, catalog eligibility, and starting a two-variant job.
3. Implement manager authorization and validated DTOs.
4. Implement project CRUD, supplier options, eligible-project catalog, and product-set replacement.
5. Revalidate 1–6 same-supplier, active, AI-eligible, in-stock products with images immediately before generation.
6. Create the linked room project/job transactionally, set `B2B_FURNITURE_LINE` with `requestedVariants: 2`, and enqueue it.
7. Run the focused API suite until green.

### Task 3: Make the worker honor fixed furniture products

**Files:**
- Modify: `apps/worker/src/modules/generation-processing/generation-processing.service.ts`
- Test: `apps/worker/test/generation-processing.service.test.mjs`

**Steps:**
1. Add a failing test proving a furniture job creates exactly two variants, uses the same selected products in both, and never calls automatic matching.
2. Load the linked B2B project and ordered products with the generation job.
3. Branch only product-set resolution by scenario; retain the shared prompt/provider/storage/snapshot flow.
4. Update the B2B project status on completion or failure.
5. Run worker tests until green and confirm Marketplace tests are unchanged.

### Task 4: Add manager client contracts and route protection

**Files:**
- Modify: `apps/web/shared/api/types.ts`
- Create: `apps/web/features/b2b/api/b2b-api.ts`
- Create: `apps/web/features/b2b/api/b2b-queries.ts`
- Create: `apps/web/features/b2b/components/manager-route-guard.tsx`
- Modify: `apps/web/widgets/header/header.tsx`
- Test: `apps/web/features/b2b/components/manager-route-guard.test.tsx`
- Test: `apps/web/features/b2b/api/b2b-api.test.ts`

**Steps:**
1. Add failing tests for MANAGER/ADMIN route access and the API request contracts.
2. Add B2B types without changing public Marketplace endpoints.
3. Implement API/query functions for projects, suppliers, eligible products, selection, generation, and detail polling.
4. Add the manager workspace header entry for MANAGER/ADMIN.
5. Run the focused web tests until green.

### Task 5: Build the manager project flow

**Files:**
- Create: `apps/web/app/(no-footer)/manager/layout.tsx`
- Create: `apps/web/app/(no-footer)/manager/projects/page.tsx`
- Create: `apps/web/app/(no-footer)/manager/projects/new/page.tsx`
- Create: `apps/web/app/(no-footer)/manager/projects/[id]/page.tsx`
- Create: `apps/web/features/b2b/components/b2b-project-list.tsx`
- Create: `apps/web/features/b2b/components/create-b2b-project-form.tsx`
- Create: `apps/web/features/b2b/components/b2b-project-workspace.tsx`
- Test: `apps/web/features/b2b/components/create-b2b-project-form.test.tsx`
- Test: `apps/web/features/b2b/components/b2b-project-workspace.test.tsx`

**Steps:**
1. Add failing component tests for project creation and the 1–6 product selection/generation rules.
2. Build the project list and new-project form.
3. Build the project workspace with manual selection, save/generate actions, progress polling, result cards, product lists, and individual image downloads.
4. Run focused web tests until green.

### Task 6: Verify and document the delivered slice

**Files:**
- Modify: `docs/wiki/current-state.md`
- Modify: `docs/wiki/api-contracts.md`
- Modify: `docs/wiki/b2b-manager-workspace.md`

**Steps:**
1. Run Prisma validation, API tests, worker tests, web tests, typecheck, and production build.
2. Update the wiki with delivered behavior, API contracts, constraints, and remaining developer/ZIP phase.
3. Review the diff for accidental Marketplace or unrelated auth changes.
4. Update Graphify if possible in the feature worktree; otherwise explicitly defer it until integration because the graph belongs to the main checkout.
