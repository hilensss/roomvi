# B2B variant labels and catalog pagination

Date: 2026-07-21

## Goal

Make the furniture-line manager workspace easier to scan by replacing
provider-generated variant titles with deterministic numbering and by adding
pagination to the product picker.

## Behavior

- Generated result cards are always labelled `Вариант 1`, `Вариант 2`, in the
  order returned by the latest generation job. The provider title remains in
  storage but is not shown in this B2B workspace.
- The product catalog requests 24 products per page through the existing
  `limit` and `offset` API parameters.
- Pagination shows the current page and total page count, with previous and
  next controls disabled at the boundaries.
- Changing the search string resets the catalog to the first page.
- The manager's unsaved product selection remains intact while searching and
  changing pages.

## Implementation

The change is local to `B2BProjectWorkspace`. It adds page state, derives the
catalog offset from that state, and renders pagination from the response's
`total`, `limit`, and `offset`. The existing catalog API contract and backend
remain unchanged.

Result cards derive one display label from their array index and use it for
both the heading and image alternative text.

## Testing

Component tests cover deterministic labels when the API returns an AI title,
next-page query parameters, navigation boundaries, and resetting to page one
after a search change. Existing selection-limit and generation tests must
continue to pass.
