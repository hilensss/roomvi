'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, ShoppingCart, User } from 'lucide-react';
import { useState } from 'react';
import { useCurrentUserQuery } from '@/features/auth/api/auth-queries';
import { AuthModal } from '@/features/auth/components/auth-modal';

const navItems = [
  { href: '/', label: 'Как это работает' },
  { href: '/', label: 'Галлерея' },
  { href: '/catalog', label: 'Каталог' },
];

export function Header() {
  const [authOpen, setAuthOpen] = useState(false);
  const currentUserQuery = useCurrentUserQuery();
  const user = currentUserQuery.data;

  return (
    <header className="sticky top-0 z-50 transform-gpu border-b border-[#bfc0c0]/40 bg-white/85 backdrop-blur-xl backface-hidden">
      <div className="rv-container flex h-20 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 md:gap-3">
          <Image
            src="/brand/rmark.svg"
            alt=""
            width={44}
            height={44}
            className="size-10 md:size-11"
            loading="eager"
          />

          <div className="text-lg font-semibold tracking-tight text-ink md:text-xl">
            РУМВИ
          </div>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-[#4f5d75] transition hover:text-[#ef8354]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' ? (
            <Link
              href="/admin/orders"
              aria-label="Админка"
              className="flex h-11 items-center gap-2 rounded-2xl border border-brand/40 px-3 text-sm font-medium text-brand transition hover:bg-brand hover:text-white"
            >
              <ShieldCheck size={18} />
              <span className="hidden lg:inline">Админка</span>
            </Link>
          ) : null}

          <Link
            href="/cart"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#bfc0c0]/70 text-[#2d3142] transition hover:border-[#ef8354] hover:text-[#ef8354]"
          >
            <ShoppingCart size={20} />
          </Link>

          {user ? (
            <Link
              href="/account"
              className="hidden h-11 items-center gap-2 rounded-pill bg-dark px-4 text-sm font-medium text-white transition hover:bg-brand sm:flex"
            >
              <User size={20} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="hidden h-11 items-center gap-2 rounded-pill bg-brand px-5 text-sm font-medium text-white transition hover:bg-dark sm:flex"
            >
              <User size={20} />
            </button>
          )}

          <AuthModal
            open={authOpen}
            initialMode="register"
            onClose={() => setAuthOpen(false)}
            onSuccess={() => setAuthOpen(false)}
          />
        </div>
      </div>
    </header>
  );
}
