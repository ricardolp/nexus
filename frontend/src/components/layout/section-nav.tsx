import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface SectionNavItem<T extends string> {
  id: T;
  label: string;
  icon: React.ReactNode;
}

export function SectionNav<T extends string>({
  items,
  value,
  onChange
}: {
  items: SectionNavItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <>
      <nav className="hidden shrink-0 flex-col gap-1 lg:flex lg:w-52">
        {items.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={value === item.id ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('justify-start gap-2', value === item.id && 'font-semibold')}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:hidden">
        {items.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={value === item.id ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>
    </>
  );
}
