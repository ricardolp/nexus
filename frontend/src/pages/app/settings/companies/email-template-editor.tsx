import { useCallback, useRef } from 'react';
import { BoldIcon, ItalicIcon, ListIcon, UnderlineIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ApiEmailToken } from '@/lib/api-types';

export function EmailTemplateEditor({
  tokens,
  html,
  onChange,
  disabled
}: {
  tokens: ApiEmailToken[];
  html: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  const sync = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    onChange(root.innerHTML);
  }, [onChange]);

  function command(cmd: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    sync();
  }

  function insertToken(token: string) {
    if (disabled) return;
    const root = editorRef.current;
    if (!root) return;
    root.focus();
    document.execCommand('insertText', false, token);
    sync();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1">
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => command('bold')} disabled={disabled}>
          <BoldIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => command('italic')} disabled={disabled}>
          <ItalicIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => command('underline')} disabled={disabled}>
          <UnderlineIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => command('insertUnorderedList')} disabled={disabled}>
          <ListIcon className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="ml-1 h-8" disabled={disabled}>
              Inserir variável
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            {tokens.map((t) => (
              <DropdownMenuItem key={t.token} onClick={() => insertToken(t.token)}>
                <span className="font-mono text-xs">{t.token}</span>
                <span className="text-muted-foreground ml-2 text-xs">{t.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={cn(
          'bg-background min-h-[160px] rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none',
          'focus-visible:ring-ring focus-visible:ring-2',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
        onInput={sync}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
