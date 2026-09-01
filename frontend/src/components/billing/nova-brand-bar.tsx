import { NexusMark } from '@/components/brand/nexus-mark';

export function NovaBrandBar() {
  return (
    <div className="bg-nova-gold flex items-center justify-between gap-4 overflow-hidden rounded-lg px-3 py-2.5">
      <img src="/brand/nova-logo.jpg" alt="Nova Consulting" className="h-8 w-auto sm:h-10" />
      <div className="text-nova-ink flex items-center gap-2">
        <NexusMark size={28} />
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-semibold tracking-wide">NEXUS</p>
          <p className="text-[10px] tracking-wide opacity-80">Mensageria Fiscal SAP</p>
        </div>
      </div>
    </div>
  );
}
