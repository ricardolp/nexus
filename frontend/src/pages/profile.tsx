import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BellIcon,
  HistoryIcon,
  PaletteIcon,
  ShieldCheckIcon,
  UserIcon
} from 'lucide-react';

import { getMe } from '@/lib/endpoints';
import { resolveDisplayName, useAuthStore } from '@/store/auth-store';
import { SectionNav } from '@/components/layout/section-nav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileActivityTab } from './profile/activity-tab';
import { ProfileAppearanceTab } from './profile/appearance-tab';
import { ProfileGeneralTab } from './profile/general-tab';
import { initials, roleLabels, type AppearancePrefs, type NotificationPrefs } from './profile/helpers';
import { ProfileNotificationsTab } from './profile/notifications-tab';
import { ProfileSecurityTab } from './profile/security-tab';

type ProfileTab = 'general' | 'appearance' | 'security' | 'activity' | 'notifications';

const profileTabs: { id: ProfileTab; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'Geral', icon: <UserIcon className="size-4" /> },
  { id: 'appearance', label: 'Aparência', icon: <PaletteIcon className="size-4" /> },
  { id: 'security', label: 'Segurança', icon: <ShieldCheckIcon className="size-4" /> },
  { id: 'activity', label: 'Atividade', icon: <HistoryIcon className="size-4" /> },
  { id: 'notifications', label: 'Notificações', icon: <BellIcon className="size-4" /> }
];

export default function ProfilePage() {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const mfaSetupRequired = useAuthStore((s) => s.mfaSetupRequired);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const [tab, setTab] = useState<ProfileTab>(mfaSetupRequired ? 'security' : 'general');

  useEffect(() => {
    if (mfaSetupRequired) setTab('security');
  }, [mfaSetupRequired]);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(token!),
    enabled: !!token
  });
  const apiUser = meQuery.data?.user;
  const name = resolveDisplayName({
    ...(authUser ?? {
      id: '',
      email: apiUser?.email ?? '',
      platformRole: 'member',
      status: 'active',
      role: 'user'
    }),
    displayName: apiUser?.display_name ?? authUser?.displayName,
    email: apiUser?.email ?? authUser?.email ?? ''
  });

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!apiUser) return;
    setDisplayName(apiUser.display_name ?? '');
    setPhone(apiUser.phone ?? '');
    setBio(apiUser.bio ?? '');
    setTimezone(apiUser.timezone ?? 'America/Sao_Paulo');
    setUserProfile(apiUser);
  }, [apiUser, setUserProfile]);

  useEffect(() => {
    if (!token || !apiUser?.has_avatar) {
      setAvatarUrl(null);
      return;
    }
    const url = `${import.meta.env.VITE_API_URL ?? import.meta.env.VITE_CONTROL_API_URL ?? 'http://localhost:4000'}/v1/users/me/avatar`;
    let objectUrl: string | null = null;
    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, apiUser?.has_avatar]);

  const appearance = (apiUser?.appearance_json ?? {}) as AppearancePrefs;
  const notifications = (apiUser?.notification_preferences_json ?? {}) as NotificationPrefs;

  if (!authUser || !token) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback className="text-lg">{initials(name || authUser.email)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{name || authUser.email}</h2>
          <p className="text-muted-foreground text-sm">{authUser.email}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{roleLabels[authUser.platformRole] ?? authUser.platformRole}</Badge>
            {organization && <Badge variant="outline">{organization.trade_name || organization.legal_name}</Badge>}
            {apiUser?.email_verified_at && <Badge variant="outline">E-mail verificado</Badge>}
            {apiUser?.mfa_enabled && <Badge variant="outline">2FA ativo</Badge>}
          </div>
        </div>
      </div>

      {mfaSetupRequired && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle>Conclua o 2FA</CardTitle>
            <CardDescription>
              Sua organização exige autenticação em dois fatores.{' '}
              <Link to="/mfa-setup" className="underline underline-offset-4">
                Abrir o assistente de configuração
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <SectionNav items={profileTabs} value={tab} onChange={setTab} />
        <div className="min-w-0 flex-1">
          {tab === 'general' && (
            <ProfileGeneralTab
              token={token}
              name={name}
              email={authUser.email}
              apiUser={apiUser}
              avatarUrl={avatarUrl}
              displayName={displayName}
              setDisplayName={setDisplayName}
              phone={phone}
              setPhone={setPhone}
              bio={bio}
              setBio={setBio}
              timezone={timezone}
              setTimezone={setTimezone}
              onUser={setUserProfile}
            />
          )}
          {tab === 'appearance' && (
            <ProfileAppearanceTab token={token} appearance={appearance} onUser={setUserProfile} />
          )}
          {tab === 'security' && (
            <ProfileSecurityTab token={token} passwordChangedAt={apiUser?.password_changed_at} />
          )}
          {tab === 'activity' && <ProfileActivityTab token={token} />}
          {tab === 'notifications' && (
            <ProfileNotificationsTab token={token} prefs={notifications} onUser={setUserProfile} />
          )}
        </div>
      </div>
    </div>
  );
}
