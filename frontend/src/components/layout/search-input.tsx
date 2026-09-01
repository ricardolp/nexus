import { SearchIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function SearchInput({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onOpen}
      className="text-muted-foreground relative h-8 w-8 justify-start rounded-lg bg-muted/40 px-2 font-normal shadow-none sm:w-56 sm:pr-12"
    >
      <SearchIcon className="size-4" />
      <span className="hidden sm:inline">Buscar...</span>
      <kbd className="bg-muted pointer-events-none absolute top-1.5 right-1.5 hidden h-5 items-center gap-0.5 rounded border px-1.5 font-mono text-[10px] font-medium sm:flex">
        {isMac() ? '⌘' : 'Ctrl'} K
      </kbd>
    </Button>
  );
}
