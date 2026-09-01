import { ArrowUpFromLineIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NFeSaidaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpFromLineIcon className="size-5" />
          NF-e Saída
        </CardTitle>
        <CardDescription>Emissão e acompanhamento de notas fiscais de saída.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          O fluxo de saída (emissão de NF-e) ainda não está disponível nesta versão.
        </p>
      </CardContent>
    </Card>
  );
}
