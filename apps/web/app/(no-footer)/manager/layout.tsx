import Link from 'next/link';
import { BriefcaseBusiness } from 'lucide-react';
import { ManagerRouteGuard } from '@/features/b2b/components/manager-route-guard';

export default function ManagerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ManagerRouteGuard>
      <div className="min-h-full bg-[#f7f6f3]">
        <div className="border-b border-line/40 bg-dark text-white">
          <div className="rv-container-wide flex items-center justify-between py-4">
            <Link
              href="/manager/projects"
              className="flex items-center gap-3 font-semibold"
            >
              <BriefcaseBusiness className="size-5 text-brand" />
              ROOMVI · B2B
            </Link>
            <Link
              href="/account"
              className="text-sm text-line transition hover:text-white"
            >
              Личный кабинет
            </Link>
          </div>
        </div>
        {children}
      </div>
    </ManagerRouteGuard>
  );
}
