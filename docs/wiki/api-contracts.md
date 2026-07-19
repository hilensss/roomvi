# API contracts

## Public orders

- `POST /orders` — body: `customerName`, `customerEmail`, `customerPhone`, `deliveryCity`, `deliveryAddress`, optional `deliveryPostalCode`, `deliveryComment`, `customerComment`; optional header `Idempotency-Key`.
- `GET /orders?limit=20&offset=0` — `{ items, total, limit, offset }`.
- `GET /orders/:id` — owner-scoped detail; чужой и отсутствующий заказ возвращают `404`.
- `POST /orders/:id/cancel` — отмена при допустимых payment/fulfillment состояниях.

Public item не содержит `externalProductId`, `supplierNameSnapshot`, `productUrlSnapshot` или `managerComment`. Payment представлен одной последней summary: `id`, `provider`, `status`, `amount`, `currency`, `paymentUrl`, `paidAt`.

## Profile summary

`GET /profile/summary` сохраняет ключ `orders` для совместимости, но каждая запись содержит только безопасные scalars: `id`, `number`, `status`, `paymentStatus`, `fulfillmentStatus`, `totalAmount`, `currency`, `createdAt`, `updatedAt`. Полная история и позиции загружаются через public Orders API. В `projects` не попадают внутренние B2B-проекты.

## Admin orders

- `GET /admin/orders` — `limit`, `offset`, `status`, `paymentStatus`, `fulfillmentStatus`, точный `number`, partial `customerEmail`, partial `customerPhone`, ISO `createdFrom`, `createdTo`, legacy `search`.
- `GET /admin/orders/:id` — полный внутренний detail.
- `PATCH /admin/orders/:id/status` — `{ status }`.
- `PATCH /admin/orders/:id/manager-comment` — `{ managerComment: string | null }`, максимум 2000 символов.
- `PATCH /admin/orders/:id/items/:itemId/procurement-status` — `{ procurementStatus }`.
- `PATCH /admin/orders/:id/items/:itemId/manager-comment` — `{ managerComment: string | null }`.

Все admin endpoints защищены `JwtAuthGuard + AdminGuard`. Mutation возвращает обновлённый admin order detail.

## B2B furniture projects

Все endpoints ниже защищены `JwtAuthGuard + ManagerGuard`. Доступ имеют роли `MANAGER` и `ADMIN`.

- `GET /manager/b2b-projects?limit=20&offset=0&search=&status=` — список проектов.
- `GET /manager/b2b-projects/suppliers` — активные поставщики для формы проекта.
- `POST /manager/b2b-projects` — создать мебельный проект. Body: `name`, `partnerName`, `supplierId`, `roomType`, `style`, optional `managerComment`.
- `GET /manager/b2b-projects/:id` — проект, сохранённая подборка и последний generation job с вариантами.
- `PATCH /manager/b2b-projects/:id` — изменить поля проекта до начала/завершения генерации. При смене поставщика подборка очищается.
- `GET /manager/b2b-projects/:id/catalog?limit=40&offset=0&search=` — только активные, AI-eligible товары в наличии, с изображениями, принадлежащие поставщику проекта.
- `PUT /manager/b2b-projects/:id/products` — заменить ручную подборку. Body: `{ productIds: string[] }`, от 1 до 6 уникальных UUID.
- `POST /manager/b2b-projects/:id/generate` — атомарно захватить проект, повторно проверить подборку и создать `B2B_FURNITURE_LINE` job с `requestedVariants = 2`. Допустим для `READY_TO_GENERATE` и повторно для `FAILED`.
- `GET /manager/b2b-projects/:id/variants/:variantId/download` — проверить принадлежность варианта проекту и вернуть изображение с `Content-Disposition: attachment`. Proxy принимает только image-ответы с origin из `S3_PUBLIC_BASE_URL` или `B2B_DOWNLOAD_ALLOWED_ORIGINS`, запрещает redirects, ограничивает запрос десятью секундами, поток — 20 MiB.

Для обеих визуализаций worker использует одну и ту же сохранённую подборку и не вызывает автоматический product matching. Каждый подготовленный запрос должен вернуть ровно одну визуализацию. В `DesignVariantProduct` сохраняются товарные snapshots, которые используются в B2B-результате вместо изменяемых live-данных каталога.

Обычные Marketplace endpoints загружают только `GenerationScenario.MARKETPLACE` и `RoomProject` без связи с `B2BProject`. B2B-варианты нельзя выбрать или добавить в пользовательскую корзину.
