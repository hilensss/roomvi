# Developer Generation And Catalog Quality Design

**Date:** 2026-08-04

**Status:** Approved in conversation

## Goal

Make B2B developer-room results reliable for small rooms and sparse catalog
coverage: keep every YES AI request within provider limits, preserve believable
physical scale, select a compact and diverse product set, and extend the local
Askona catalog for hallways, kids' rooms, bathrooms, and offices.

## Scope

This change includes:

- final YES AI prompt length enforcement;
- stronger physical-scale cues for the empty-room stage;
- size-aware, category-aware product matching;
- explicit product templates for `HALLWAY`, `KIDS_ROOM`, `BATHROOM`, and
  `OFFICE`;
- new normalized product categories required by the Askona assortment;
- curated Askona product records with official product URLs, current captured
  prices, dimensions, images, room types, and styles;
- reproducible catalog synchronization through the existing supplier adapter;
- focused tests and wiki updates.

This change does not include:

- runtime scraping of Askona on every application start;
- supplier checkout or stock reservation;
- importing sanitary ware or pretending that bedroom cabinets are
  moisture-resistant bathroom furniture;
- automatic visual verification of every generated product with an additional
  reasoning-model call. A compact product set and explicit prompts reduce
  omissions; image-level verification remains a separate enhancement.

## Decisions

### Askona data source

Use a curated snapshot of official Askona product pages inside the existing
mock supplier JSON source. The source remains deterministic and can be loaded
through `CatalogSyncService.syncMockSupplier()` without direct database-only
fixtures.

Every newly curated record must contain:

- a stable Askona product ID in `externalId`;
- the official product page URL;
- at least one official Askona image URL;
- captured current and old prices when available;
- width, height, and depth when the product has physical dimensions;
- accurate normalized category, room types, styles, stock status, material,
  and color.

Prices are catalog snapshots, not live checkout guarantees.

### Product taxonomy

Add these `ProductCategory` values:

- `MIRROR`;
- `BENCH`;
- `SHOE_CABINET`;
- `HANGER`.

Existing categories remain unchanged. Office chairs continue to use `CHAIR`;
bathroom accessories use `DECOR`.

The frontend category union and labels must stay aligned with Prisma.

### Catalog coverage

After synchronization, AI-eligible in-stock products must provide at least the
following category coverage:

- `HALLWAY`: `WARDROBE`, `SHOE_CABINET`, `MIRROR`, `BENCH`, and `HANGER`;
- `KIDS_ROOM`: `BED`, `DESK`, `CHAIR` or `BENCH`, `SHELF`, and `WARDROBE`;
- `BATHROOM`: at least three `MIRROR` products and at least two suitable
  `DECOR` accessories from Askona's bathroom/home assortment;
- `OFFICE`: `DESK`, `CHAIR`, `SHELF`, and `LAMP`.

An existing Askona product may gain additional accurate `roomTypes`; new
products are added when a required category is absent or lacks diversity.

### Product matching

Room templates use these limits:

- `HALLWAY`: 1-3 products; at most two when the confirmed footprint is below
  4 m²; no more than one product from each category and no more than one
  wardrobe;
- `KIDS_ROOM`: 4-7 products;
- `BATHROOM`: 1-3 products; only `MIRROR` and suitable `DECOR` categories;
- `OFFICE`: 3-6 products.

The matcher calculates area from `widthCm * depthCm` when `areaM2` is absent.
A product with known dimensions is ineligible when neither orientation fits
within the room footprint. Products with missing dimensions remain lower
priority and cannot satisfy a required physical-furniture category.

The generic fill step must respect category caps. It must not reach a minimum
count by adding several wardrobes or other capped categories. Returning fewer
valid products is preferable to an inaccurate selection.

The generated variant total remains the sum of the saved selected products.
Because the selected set is compact and category-diverse, the prompt requires
each selected product exactly once. The application does not claim that a
post-generation vision audit occurred.

### YES AI prompt limit

The provider owns enforcement of its final request limit. It builds the exact
prompt sent over HTTP and guarantees a maximum length of 10,000 characters
after source-image instructions, variant instructions, and the negative prompt
are appended.

Essential content is preserved in this order:

1. room and catalog prompt;
2. geometry and source-image constraints;
3. core quality constraints;
4. negative prompt, truncated only when necessary.

If essential content alone cannot fit, the provider fails locally with an
explicit validation error and does not spend a generation request.

### Small-room geometry

The annotated geometry reference must continue to preserve the polygon aspect
ratio, and additionally show:

- width and depth in metres and centimetres;
- a one-metre scale bar;
- the room area derived from confirmed dimensions;
- a prominent `COMPACT ROOM` marker below 4 m²;
- the selected camera wall and opening positions.

The empty-shell prompt explicitly requests a normal 45-50 mm equivalent lens,
natural eye height, and the confirmed dimensions. It forbids wide-angle,
fisheye, oversized corridors, expanded walls, and invented adjoining space.

This improves scale adherence within the existing two-stage generative flow;
it does not claim CAD-level geometric reconstruction.

## Data Flow

1. Curated official Askona records are stored in `mock-products.json`.
2. Existing supplier sync upserts raw and normalized product records.
3. A confirmed B2B room starts one developer generation job.
4. The geometry renderer creates a dimensioned reference with physical-scale
   cues.
5. YES AI produces or reuses the empty-room shell.
6. Product matching filters by room type, category, dimensions, style, stock,
   and per-template category caps.
7. Prompt building describes every selected product exactly once.
8. The provider assembles and validates the final <=10,000-character prompt.
9. YES AI produces the furnished room.
10. The final image and exact selected-product snapshots are stored on one
    design variant.

## Error Handling

- Invalid final prompts fail locally before the HTTP request with actual and
  maximum lengths in the message.
- A room with no valid product set remains a reviewable failed room without
  changing successful rooms.
- Catalog records without official images or product URLs are not AI-eligible.
- Oversized products are skipped rather than used to satisfy a template.
- Catalog sync remains idempotent by `(supplierId, externalId)`.

## Testing

Add or update tests that prove:

- the exact provider prompt never exceeds 10,000 characters;
- negative-prompt truncation preserves essential room instructions;
- a 1.92 m² hallway returns no more than two products and never two
  wardrobes;
- category caps are respected by the fallback fill path;
- bathroom matching never falls back to sofas or unrelated furniture;
- known oversized products are excluded;
- the geometry SVG contains physical dimensions, area, a scale bar, and the
  compact-room marker;
- curated Askona products satisfy required fields and category coverage;
- catalog synchronization remains idempotent;
- existing API, worker, and web test suites continue to pass.

## Acceptance Criteria

- Retrying the current living-room job no longer returns
  `PROMPT_NOT_VALID` due to prompt length.
- The current 120 x 160 cm hallway reference explicitly communicates its
  compact size and requests a non-wide-angle shell.
- The hallway matcher cannot produce the previous four-wardrobe, 148,995 RUB
  selection.
- Developer-room matching has valid catalog coverage for hallway, kids' room,
  bathroom, and office.
- Newly added Askona items survive a repeat catalog sync and retain official
  source links.
