import { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type IconBadgeProps = {
  icon: LucideIcon;
  className?: string;
};

export function IconBadge({ icon: Icon, className }: IconBadgeProps) {
  return (
    <div
      className={cn(
        'flex size-14 items-center justify-center rounded-md bg-brand-soft text-brand',
        className,
      )}
    >
      <Icon size={26} />
    </div>
  );
}
