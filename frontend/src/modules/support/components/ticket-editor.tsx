import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoldIcon, ItalicIcon, ListIcon, UnderlineIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TicketFiscalRef } from '@/modules/support/data';

export function TicketEditor({
  documents,
  onChange
}: {
  documents: ApiFiscalDocument[];
  onChange: (html: string, refs: TicketFiscalRef[]) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.replace(/^#/, '');
    if (!q) return documents.filter((d) => d.number).slice(0, 8);
    return documents.filter((d) => (d.number ?? '').includes(q)).slice(0, 8);
  }, [documents, query]);

  const emit = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const refs: TicketFiscalRef[] = [];
    root.querySelectorAll('a[data-fiscal-id]').forEach((el) => {
      const number = el.getAttribute('data-fiscal-number');
      const documentId = el.getAttribute('data-fiscal-id');
      const documentType = el.getAttribute('data-fiscal-type') ?? 'nfe';
      if (number && documentId) refs.push({ number, documentId, documentType });
    });
    const text = root.innerText ?? '';
    for (const match of text.matchAll(/#(\d+)/g)) {
      const number = match[1];
      if (refs.some((r) => r.number === number)) continue;
      const doc = documents.find((d) => d.number === number);
      if (doc) refs.push({ number, documentId: doc.id, documentType: doc.document_type });
    }
    onChange(root.innerHTML, refs);
  }, [documents, onChange]);

  function command(cmd: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    emit();
  }

  function insertDocument(doc: ApiFiscalDocument) {
    const root = editorRef.current;
    if (!root || !doc.number) return;
    root.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const prefix = range.startContainer.textContent?.slice(0, range.startOffset) ?? '';
    const hash = prefix.match(/#\d*$/);
    if (hash && range.startContainer.nodeType === Node.TEXT_NODE) {
      range.setStart(range.startContainer, range.startOffset - hash[0].length);
    }
    range.deleteContents();
    const link = document.createElement('a');
    link.href = doc.document_type === 'nfse' ? `/app/nfse/${doc.id}` : `/app/nfe/${doc.id}`;
    link.setAttribute('data-fiscal-id', doc.id);
    link.setAttribute('data-fiscal-number', doc.number);
    link.setAttribute('data-fiscal-type', doc.document_type);
    link.textContent = `#${doc.number}`;
    link.className = 'text-primary font-medium underline underline-offset-2';
    range.insertNode(link);
    range.setStartAfter(link);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    setOpen(false);
    setQuery('');
    emit();
  }

  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const onInput = () => {
      const sel = window.getSelection();
      const text = sel?.anchorNode?.textContent?.slice(0, sel.anchorOffset) ?? '';
      const match = text.match(/#(\d*)$/);
      if (match) {
        setQuery(match[0]);
        setOpen(true);
      } else {
        setOpen(false);
        setQuery('');
      }
      emit();
    };
    root.addEventListener('input', onInput);
    root.addEventListener('keyup', onInput);
    return () => {
      root.removeEventListener('input', onInput);
      root.removeEventListener('keyup', onInput);
    };
  }, [emit]);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => command('bold')}>
          <BoldIcon />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => command('italic')}>
          <ItalicIcon />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => command('underline')}>
          <UnderlineIcon />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => command('insertUnorderedList')}>
          <ListIcon />
        </Button>
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          data-placeholder="Descreva o ocorrido. Use #132 para marcar uma NF-e."
          className={cn(
            'border-input min-h-36 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]'
          )}
        />
        {open && matches.length > 0 && (
          <div className="bg-popover absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md">
            {matches.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="hover:bg-accent flex w-full flex-col items-start px-3 py-2 text-left text-sm"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertDocument(doc);
                }}
              >
                <span className="font-medium">#{doc.number}</span>
                <span className="text-muted-foreground text-xs">
                  {doc.issuer_name ?? doc.document_type.toUpperCase()}
                  {doc.series ? ` · série ${doc.series}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Digite <code className="text-foreground">#</code> e o número da nota para inserir um atalho.
      </p>
    </div>
  );
}
