import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { XIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 20;

type EmailChipsInputProps = {
  id?: string;
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

function splitTokens(raw: string): string[] {
  return raw
    .split(/[;,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function EmailChipsInput({
  id,
  value,
  onChange,
  placeholder = 'digite o e-mail e pressione ;',
  disabled
}: EmailChipsInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const tokens = splitTokens(raw);
    if (tokens.length === 0) {
      setDraft('');
      return;
    }

    const next = [...value];
    for (const token of tokens) {
      const email = token.toLowerCase();
      if (!isValidEmail(email)) {
        setError('Informe um e-mail válido.');
        setDraft(token);
        return;
      }
      if (next.includes(email)) {
        continue;
      }
      if (next.length >= MAX_EMAILS) {
        setError('No máximo 20 e-mails.');
        setDraft('');
        onChange(next);
        return;
      }
      next.push(email);
    }

    setError(null);
    setDraft('');
    onChange(next);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    setError(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ';' || event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!text) return;
    event.preventDefault();
    commit(`${draft}${text}`);
  };

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'border-input dark:bg-input/30 flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1 shadow-xs transition-[color,box-shadow]',
          'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
          error && 'border-destructive aria-invalid:ring-destructive/20',
          disabled && 'pointer-events-none opacity-50'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((email, index) => (
          <Badge key={email} variant="secondary" className="gap-1 pr-0.5 font-normal">
            {email}
            <button
              type="button"
              className="hover:bg-muted rounded-sm p-0.5"
              aria-label={`Remover ${email}`}
              onClick={(event) => {
                event.stopPropagation();
                removeAt(index);
              }}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          disabled={disabled}
          value={draft}
          placeholder={value.length === 0 ? placeholder : ''}
          className="placeholder:text-muted-foreground min-w-[12rem] flex-1 bg-transparent py-0.5 text-sm outline-none"
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
      </div>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Pressione <span className="font-medium">;</span> ou Enter para adicionar o e-mail.
        </p>
      )}
    </div>
  );
}
