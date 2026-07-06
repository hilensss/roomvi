import { Footer } from '@/widgets/footer/footer';
import { Header } from '@/widgets/header/header';

export default function WithFooterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-background text-foreground">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
