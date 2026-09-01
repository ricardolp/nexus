import { useTheme } from 'next-themes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';

import { updateMe } from '@/lib/endpoints';
import type { ApiUser } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { accentSwatches, type AppearancePrefs } from './helpers';

const defaults: Required<AppearancePrefs> = {
  theme: 'system',
  density: 'comfortable',
  font_size: 'md',
  accent: 'violet'
};

const fontPreviewSize: Record<string, string> = {
  sm: 'text-[13px]',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg'
};

function ThemePreview({ mode }: { mode: 'light' | 'dark' | 'system' }) {
  if (mode === 'system') {
    return (
      <div className="relative h-24 overflow-hidden rounded-lg border">
        <div className="absolute inset-0 flex">
          <div className="flex w-1/2 bg-zinc-100">
            <div className="w-6 bg-zinc-200" />
            <div className="flex flex-1 flex-col gap-1.5 p-2">
              <div className="h-1.5 w-10 rounded bg-zinc-300" />
              <div className="h-8 rounded-md border border-zinc-200 bg-white" />
            </div>
          </div>
          <div className="flex w-1/2 bg-zinc-950">
            <div className="w-6 bg-zinc-900" />
            <div className="flex flex-1 flex-col gap-1.5 p-2">
              <div className="h-1.5 w-10 rounded bg-zinc-700" />
              <div className="h-8 rounded-md border border-zinc-800 bg-zinc-900" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  const dark = mode === 'dark';
  return (
    <div
      className={cn(
        'flex h-24 overflow-hidden rounded-lg border',
        dark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-100'
      )}
    >
      <div className={cn('w-7', dark ? 'bg-zinc-900' : 'bg-zinc-200')} />
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className={cn('h-1.5 w-12 rounded', dark ? 'bg-zinc-700' : 'bg-zinc-300')} />
        <div
          className={cn(
            'h-9 rounded-md border',
            dark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200 bg-white'
          )}
        />
        <div className={cn('h-1.5 w-16 rounded', dark ? 'bg-zinc-800' : 'bg-zinc-200')} />
      </div>
    </div>
  );
}

export function ProfileAppearanceTab({
  token,
  appearance,
  onUser
}: {
  token: string;
  appearance: AppearancePrefs;
  onUser: (user: ApiUser) => void;
}) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const currentTheme = (theme ?? appearance.theme ?? 'system') as 'light' | 'dark' | 'system';
  const density = appearance.density ?? 'comfortable';
  const fontSize = appearance.font_size ?? 'md';
  const accent = appearance.accent ?? 'violet';

  const save = useMutation({
    mutationFn: (next: AppearancePrefs) => updateMe(token, { appearance_json: { ...appearance, ...next } }),
    onSuccess: (user) => {
      onUser(user);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Aparência salva');
    }
  });

  function apply(next: AppearancePrefs) {
    if (next.theme === 'light' || next.theme === 'dark' || next.theme === 'system') {
      setTheme(next.theme);
    }
    save.mutate(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aparência</CardTitle>
        <CardDescription>Personalize tema, cores e densidade da interface.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <div className="grid gap-3">
          <Label className="text-muted-foreground text-xs tracking-wide uppercase">Tema</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['light', 'Claro', SunIcon],
                ['dark', 'Escuro', MoonIcon],
                ['system', 'Sistema', MonitorIcon]
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => apply({ theme: value })}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border-2 p-2 text-left transition-colors',
                  currentTheme === value ? 'border-primary' : 'border-transparent hover:border-border'
                )}
              >
                <ThemePreview mode={value} />
                <span className="flex items-center gap-1.5 px-1 text-sm font-medium">
                  <Icon className="size-3.5" />
                  {label}
                  {value === 'system' && (
                    <span className="text-muted-foreground ml-auto text-xs font-normal">Auto</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <Label className="text-muted-foreground text-xs tracking-wide uppercase">
            Cor de destaque
            <span className="text-foreground ml-2 font-medium normal-case">
              {accentSwatches.find((s) => s.id === accent)?.label}
            </span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {accentSwatches.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                title={swatch.label}
                aria-label={swatch.label}
                onClick={() => apply({ accent: swatch.id })}
                className={cn(
                  'size-8 rounded-full ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  swatch.className,
                  accent === swatch.id && 'ring-foreground ring-2 ring-offset-2'
                )}
              >
                {accent === swatch.id && <CheckIcon className="mx-auto size-4 text-white drop-shadow" />}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <Label className="text-muted-foreground text-xs tracking-wide uppercase">
            Tamanho da fonte
            <span className="text-foreground ml-2 font-medium normal-case">
              {fontSize === 'sm' ? 'Pequeno (13px)' : fontSize === 'lg' ? 'Grande (16px)' : fontSize === 'xl' ? 'XL (18px)' : 'Padrão (14px)'}
            </span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['sm', 'Pequeno'],
                ['md', 'Padrão'],
                ['lg', 'Grande'],
                ['xl', 'XL']
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={fontSize === value ? 'default' : 'outline'}
                onClick={() => apply({ font_size: value })}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className={cn('text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2', fontPreviewSize[fontSize])}>
            The quick brown fox jumps over the lazy dog. Prévia de como o conteúdo fica neste tamanho.
          </p>
        </div>

        <div className="grid gap-3">
          <Label className="text-muted-foreground text-xs tracking-wide uppercase">Densidade da interface</Label>
          <div className="bg-muted grid grid-cols-3 rounded-lg p-1">
            {(
              [
                ['compact', 'Compacta'],
                ['comfortable', 'Confortável'],
                ['spacious', 'Espaçosa']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => apply({ density: value })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  density === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={() => apply(defaults)} disabled={save.isPending}>
          Restaurar padrão
        </Button>
      </CardFooter>
    </Card>
  );
}
