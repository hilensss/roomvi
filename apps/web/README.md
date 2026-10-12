# Roomvi Web

Frontend платформы Roomvi на Next.js 16, React 19 и Tailwind CSS 4.

Приложение включает маркетплейс мебели, создание интерьеров, корзину и оформление заказов, личный кабинет, административные страницы и внутренний B2B-кабинет менеджера.

## Запуск

Установка зависимостей и настройка PostgreSQL, Redis, S3 и API описаны в [основном README](../../README.md#локальный-запуск).

Создайте `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Из корня репозитория:

```bash
npm run dev -w web
```

Интерфейс доступен на [localhost:3000](http://localhost:3000). Для пользовательских сценариев также должны работать API и worker.

## Структура

```text
app/          # Маршруты, layout и страницы
features/     # Функциональность по предметным областям
widgets/      # Составные блоки интерфейса
shared/       # API-клиент, UI, локализация и общие утилиты
```

Данные сервера управляются через TanStack Query; формы используют React Hook Form. Общие компоненты и стили находятся в `shared/`.

## Проверки

Команды выполняются из корня репозитория:

```bash
npm run lint -w web
npm run typecheck -w web
npm run test -w web
npm run build -w web
```
