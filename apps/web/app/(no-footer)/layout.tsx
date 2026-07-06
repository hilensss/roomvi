import { Header } from '@/widgets/header/header';

export default function NoFooterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-background text-foreground">
      <Header />
      <main>{children}</main>
    </div>
  );
}
