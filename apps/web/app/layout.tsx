import type { Metadata } from 'next';
import './globals.css';

import { QueryProvider } from '@/shared/providers/query-provider';

export const metadata: Metadata = {
  title: 'Roomvi',
  description: 'AI-платформа для дизайна интерьера с реальными товарами',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
