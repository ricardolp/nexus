import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

interface OrganizationLogoProps {
  logo?: string | null;
  nome: string;
  className?: string;
  iconClassName?: string;
}

export function OrganizationLogo({
  logo,
  nome,
  className,
  iconClassName,
}: OrganizationLogoProps) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={`Logo ${nome}`}
        className={cn('size-full object-cover', className)}
      />
    );
  }

  return <Icons.galleryVerticalEnd className={cn('size-4', iconClassName)} />;
}
