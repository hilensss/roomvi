# Текущее состояние Roomvi

Обновлено: 2026-07-16.

## Реализовано

- Transactional server-authoritative checkout с immutable snapshots, идемпотентностью и `Payment(MANUAL, PENDING)`.
- Клиентский `/checkout` с валидацией, безопасным retry и responsive summary.
- История заказов внутри `/account`: pagination, lazy detail, payment state и отмена.
- Admin orders: защищённый список с shareable URL-фильтрами, отдельный detail, order state, procurement и manager comments.
- Явное разделение публичных и внутренних response types; `/profile/summary` больше не раскрывает OrderItem internals.
- Web test setup на Vitest + Testing Library.

## Не реализовано

- Реальный эквайринг, bank callbacks, refunds и payment redirects.
- Расчёт доставки или адресная книга пользователя.
- Supplier API и отдельная очередь SupplierOrder.
- Event-driven order infrastructure.
