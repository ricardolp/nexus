import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { updateMe } from '@/lib/endpoints';
import type { ApiUser } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { NotificationPrefs } from './helpers';

type PrefKey = keyof NotificationPrefs;

const groups: {
  id: string;
  title: string;
  hint: string;
  locked?: boolean;
  items: { key: PrefKey; label: string; description: string; locked?: boolean }[];
}[] = [
  {
    id: 'transactional',
    title: 'Transacionais',
    hint: 'E-mails essenciais de conta e segurança',
    locked: true,
    items: [
      {
        key: 'security_email',
        label: 'Alertas de segurança',
        description: 'Logins, 2FA e alterações de senha.',
        locked: true
      }
    ]
  },
  {
    id: 'product',
    title: 'Produto',
    hint: 'Novidades, changelog e melhorias',
    items: [
      {
        key: 'product_email',
        label: 'Atualizações de produto',
        description: 'Resumo de recursos e correções.'
      },
      {
        key: 'changelog_email',
        label: 'Digest do changelog',
        description: 'Resumo periódico de novidades e correções.'
      },
      {
        key: 'feature_email',
        label: 'Anúncios de recursos',
        description: 'Lançamentos importantes e convites de acesso antecipado.'
      }
    ]
  },
  {
    id: 'marketing',
    title: 'Marketing',
    hint: 'Newsletters, novidades comerciais e eventos',
    items: [
      {
        key: 'marketing_email',
        label: 'Comunicados e eventos',
        description: 'Conteúdo opcional sobre o produto e a comunidade.'
      }
    ]
  },
  {
    id: 'team',
    title: 'Atividade da equipe',
    hint: 'Menções, convites e comentários',
    items: [
      {
        key: 'team_email',
        label: 'Atividade da organização',
        description: 'Convites, menções e atualizações da equipe.'
      }
    ]
  }
];

function isOn(prefs: NotificationPrefs, key: PrefKey) {
  if (key === 'security_email') return prefs.security_email !== false;
  if (key === 'product_email') return prefs.product_email !== false;
  return prefs[key] === true;
}

export function ProfileNotificationsTab({
  token,
  prefs,
  onUser
}: {
  token: string;
  prefs: NotificationPrefs;
  onUser: (user: ApiUser) => void;
}) {
  const queryClient = useQueryClient();
  const optionalKeys: PrefKey[] = ['product_email', 'changelog_email', 'feature_email', 'marketing_email', 'team_email'];
  const optionalOn = optionalKeys.filter((key) => isOn(prefs, key)).length;
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const active = groups.reduce((sum, group) => sum + group.items.filter((item) => isOn(prefs, item.key)).length, 0);

  const save = useMutation({
    mutationFn: (next: NotificationPrefs) =>
      updateMe(token, { notification_preferences_json: { ...prefs, ...next } }),
    onSuccess: (user) => {
      onUser(user);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Preferências salvas');
    }
  });

  function unsubscribeOptional() {
    save.mutate({
      product_email: false,
      changelog_email: false,
      feature_email: false,
      marketing_email: false,
      team_email: false
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Preferências de e-mail</CardTitle>
            <CardDescription>Escolha quais e-mails receber e com que frequência.</CardDescription>
          </div>
          <Badge variant="secondary">
            {active} de {total} ativos
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {groups.map((group) => {
          const onCount = group.items.filter((item) => isOn(prefs, item.key)).length;
          return (
            <section key={group.id} className="px-6 py-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <p className="text-muted-foreground text-sm">{group.hint}</p>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {onCount}/{group.items.length}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {item.label}
                        {item.locked && (
                          <Badge variant="outline" className="ml-2">
                            Obrigatório
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted-foreground text-sm">{item.description}</p>
                    </div>
                    <Switch
                      checked={isOn(prefs, item.key)}
                      disabled={item.locked || save.isPending}
                      onCheckedChange={(checked) => save.mutate({ [item.key]: checked })}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </CardContent>
      <CardFooter className="text-muted-foreground justify-between gap-3 border-t text-sm">
        <p>{optionalOn} e-mails não essenciais ativos</p>
        <Button type="button" variant="ghost" size="sm" onClick={unsubscribeOptional} disabled={optionalOn === 0}>
          Cancelar não essenciais
        </Button>
      </CardFooter>
    </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Cookies e privacidade</CardTitle>
              <CardDescription>
                Apenas cookies essenciais de sessão e dispositivo confiável são usados nesta aplicação.
              </CardDescription>
            </div>
            <Badge variant="secondary">2/2 ativos</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">
                Estritamente necessários
                <Badge variant="outline" className="ml-2">
                  Obrigatório
                </Badge>
              </p>
              <p className="text-muted-foreground text-sm">
                Cookies de sessão e desafio de 2FA. Sem eles não é possível autenticar nem manter o acesso.
              </p>
            </div>
            <Switch checked disabled />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">
                Dispositivo confiável
                <Badge variant="outline" className="ml-2">
                  Segurança
                </Badge>
              </p>
              <p className="text-muted-foreground text-sm">
                Lembra este navegador para não pedir 2FA a cada login. Definido no momento em que você entra.
              </p>
            </div>
            <Switch checked disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
