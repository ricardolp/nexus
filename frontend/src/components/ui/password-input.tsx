import * as React from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-9', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={visible ? 'Ocultar senha' : 'Exibir senha'}
        aria-pressed={visible}
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}

export { PasswordInput };
