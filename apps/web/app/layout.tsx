import type { Metadata } from 'next';
import './globals.css';

import { QueryProvider } from '@/shared/providers/query-provider';
import { LocaleProvider } from '@/shared/providers/locale-provider';

export const metadata: Metadata = {
  title: 'Roomvi',
  description: 'AI-платформа для дизайна интерьера с реальными товарами',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <QueryProvider>{children}</QueryProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
