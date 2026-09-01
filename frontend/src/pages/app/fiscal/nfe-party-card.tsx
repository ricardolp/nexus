import {
  Building2Icon,
  MapPinIcon,
  PhoneIcon,
  ReceiptIcon,
  UserRoundIcon
} from 'lucide-react';

import type { ApiNFeParty } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { crtLabel, formatCEP, formatDocument } from './format';

function addressLines(party: ApiNFeParty) {
  const addr = party.address;
  if (!addr) return [];
  const line1 = [addr.street, addr.number, addr.complement].filter(Boolean).join(', ');
  const city = [addr.district, addr.city && addr.uf ? `${addr.city}/${addr.uf}` : addr.city || addr.uf]
    .filter(Boolean)
    .join(' · ');
  const cep = addr.cep ? formatCEP(addr.cep) : '';
  return [line1, [city, cep].filter(Boolean).join(' · ')].filter(Boolean);
}

export function NFePartyCard({
  role,
  party,
  fallbackDocument,
  loading
}: {
  role: 'issuer' | 'recipient';
  party?: ApiNFeParty | null;
  fallbackDocument?: string | null;
  loading?: boolean;
}) {
  const isIssuer = role === 'issuer';
  const Icon = isIssuer ? Building2Icon : UserRoundIcon;
  const title = isIssuer ? 'Emitente' : 'Destinatário';
  const document = party?.cnpj || party?.cpf || fallbackDocument;
  const name = party?.legal_name;
  const crt = crtLabel(party?.crt);
  const lines = party ? addressLines(party) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-muted flex size-8 items-center justify-center rounded-full">
            <Icon className="text-muted-foreground size-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {loading && !name ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : (
          <>
            <div>
              <p className="font-medium">{name || '—'}</p>
              {party?.trade_name && party.trade_name !== name && (
                <p className="text-muted-foreground text-xs">{party.trade_name}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {document && (
                <Badge variant="outline" className="font-mono font-normal tabular-nums">
                  <ReceiptIcon />
                  {formatDocument(document)}
                </Badge>
              )}
              {party?.ie && (
                <Badge variant="outline" className="font-normal">
                  IE {party.ie}
                </Badge>
              )}
              {crt && (
                <Badge variant="secondary" className="font-normal">
                  {crt}
                </Badge>
              )}
              {party?.address?.uf && (
                <Badge variant="outline" className="font-normal">
                  {party.address.uf}
                </Badge>
              )}
            </div>
            {lines.length > 0 && (
              <p className="text-muted-foreground flex items-start gap-2 text-xs">
                <MapPinIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </p>
            )}
            {party?.address?.phone && (
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <PhoneIcon className="size-3.5 shrink-0" />
                {party.address.phone}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
