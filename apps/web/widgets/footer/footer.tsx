import Link from 'next/link';

const footerColumns = [
  {
    title: 'Продукт',
    links: [
      { label: 'Как это работает', href: '/#how-it-works' },
      { label: 'Примеры', href: '/#examples' },
      { label: 'Партнёры', href: '/#products' },
    ],
  },
  {
    title: 'Компания',
    links: [
      { label: 'О нас', href: '#' },
      { label: 'Партнёрам', href: '#' },
      { label: 'Контакты', href: '#' },
    ],
  },
  {
    title: 'Поддержка',
    links: [
      { label: 'Помощь', href: '#' },
      { label: 'Доставка', href: '#' },
      { label: 'Возврат', href: '#' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line/50 bg-white py-12">
      <div className="rv-container-wide">
        <div className="mb-10 grid gap-8 md:grid-cols-4">
          <div>
            <Link href="/" className="mb-4 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-xs bg-brand">
                <span className="font-semibold text-white">R</span>
              </div>

              <span className="text-xl font-semibold text-ink">Roomvi</span>
            </Link>

            <p className="max-w-xs text-sm text-ink-soft">
              AI-дизайн интерьера с реальной мебелью
            </p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-4 font-semibold text-ink">{column.title}</h4>

              <ul className="space-y-2 text-sm text-ink-soft">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-brand"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-line/50 pt-6 text-center text-sm text-ink-soft">
          © 2026 Roomvi. Все права защищены.
        </div>
      </div>
    </footer>
  );
}
