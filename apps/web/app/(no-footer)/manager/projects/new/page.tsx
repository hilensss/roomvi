import Link from 'next/link';
import { CreateB2BProjectForm } from '@/features/b2b/components/create-b2b-project-form';

export default function NewManagerProjectPage() {
  return (
    <div className="rv-container py-10">
      <Link
        href="/manager/projects"
        className="text-sm text-ink-soft transition hover:text-brand"
      >
        ← Все B2B-проекты
      </Link>
      <div className="mb-8 mt-5">
        <p className="rv-eyebrow mb-2">Новая визуализация</p>
        <h1 className="text-section-title text-ink">Мебельная линейка</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Задайте контекст проекта. Товары вы выберете вручную на следующем
          шаге.
        </p>
      </div>
      <CreateB2BProjectForm />
    </div>
  );
}
