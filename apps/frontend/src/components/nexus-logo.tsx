import Image from 'next/image';
import { cn } from '@/lib/utils';

const LOGO_SQUARE = '/assets/logo-nexus-quadrada.png';
const LOGO_RECTANGULAR = '/assets/logo-nexus-retangulo.png';

type NexusLogoProps = {
  variant?: 'square' | 'rectangular';
  className?: string;
  priority?: boolean;
};

export function NexusLogo({ variant = 'rectangular', className, priority }: NexusLogoProps) {
  const isSquare = variant === 'square';

  return (
    <Image
      src={isSquare ? LOGO_SQUARE : LOGO_RECTANGULAR}
      alt='Nexus Platform'
      width={isSquare ? 120 : 200}
      height={isSquare ? 68 : 65}
      className={cn('h-auto w-auto object-contain', className)}
      priority={priority}
    />
  );
}
