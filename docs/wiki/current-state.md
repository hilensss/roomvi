# Текущее состояние Roomvi

Обновлено: 2026-07-19.

## Реализовано

- Transactional server-authoritative checkout с immutable snapshots, идемпотентностью и `Payment(MANUAL, PENDING)`.
- Клиентский `/checkout` с валидацией, безопасным retry и responsive summary.
- История заказов внутри `/account`: pagination, lazy detail, payment state и отмена.
- Admin orders: защищённый список с shareable URL-фильтрами, отдельный detail, order state, procurement и manager comments.
- Явное разделение публичных и внутренних response types; `/profile/summary` больше не раскрывает OrderItem internals.
- Web test setup на Vitest + Testing Library.
- Внутренняя роль `MANAGER`; B2B-раздел доступен менеджерам и администраторам.
- Первый B2B-сценарий для мебельщиков:
  - список и создание проектов в `/manager/projects`;
  - ручной выбор 1–6 активных AI-eligible товаров в наличии у одного поставщика;
  - повторная серверная валидация выбранного набора перед генерацией;
  - ровно две визуализации с одним неизменным набором товаров;
  - polling прогресса, повторный запуск после ошибки, просмотр snapshot-состава и отдельное скачивание изображений через защищённый attachment endpoint.
- `GenerationScenario` отделяет `MARKETPLACE` от `B2B_FURNITURE_LINE`; Marketplace по-прежнему использует автоматический подбор товаров и четыре варианта для пользователя / два для гостя, а внутренние B2B-проекты исключены из пользовательских project/design/cart API.

## Не реализовано

- Реальный эквайринг, bank callbacks, refunds и payment redirects.
- Расчёт доставки или адресная книга пользователя.
- Supplier API и отдельная очередь SupplierOrder.
- Event-driven order infrastructure.
- B2B-сценарий застройщика: загрузка планировки, распознавание комнат, одна визуализация каждой комнаты и подборка товаров.
- Общий ZIP-экспорт генераций и файлов с подборками.
