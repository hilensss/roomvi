## Состояние

- npm workspaces + Turborepo
- `packages/database`: Prisma custom output
- `packages/shared`: queue constants
- `apps/api`: auth, guest, catalog, generation API, BullMQ producer
- `apps/worker`: BullMQ consumer + generation processing + mock AI

## Текущий продуктовый приоритет

Marketplace и цепочка `AI-дизайн → товары → корзина → заказ` сохраняются.
Ближайшая последовательность развития:

1. внутренний B2B-кабинет для визуализации мебельных линеек;
2. B2B-проекты застройщиков по загруженной планировке;
3. дальнейший production-запуск Marketplace с supplier API и логистикой.

Полное описание: [`docs/wiki/b2b-manager-workspace.md`](docs/wiki/b2b-manager-workspace.md).
