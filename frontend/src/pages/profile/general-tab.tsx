import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, ImageIcon, Trash2Icon, UploadIcon, UserIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { deleteAvatar, updateMe, uploadAvatar } from '@/lib/endpoints';
import type { ApiUser } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { formatDate } from '@/pages/app/fiscal/format';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { initials, timezones } from './helpers';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfileGeneralTab({
  token,
  name,
  email,
  apiUser,
  avatarUrl,
  displayName,
  setDisplayName,
  phone,
  setPhone,
  bio,
  setBio,
  timezone,
  setTimezone,
  onUser
}: {
  token: string;
  name: string;
  email: string;
  apiUser?: ApiUser;
  avatarUrl: string | null;
  displayName: string;
  setDisplayName: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  bio: string;
  setBio: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  onUser: (user: ApiUser) => void;
}) {
  const queryClient = useQueryClient();

  const steps = [
    { id: 'name', label: 'Adicionar um nome de exibição', done: Boolean(apiUser?.display_name?.trim()), pts: 15 },
    { id: 'photo', label: 'Enviar foto de perfil', done: Boolean(apiUser?.has_avatar), pts: 15 },
    { id: 'bio', label: 'Escrever uma bio', done: Boolean(apiUser?.bio?.trim()), pts: 10 },
    { id: 'tz', label: 'Definir fuso horário', done: Boolean(apiUser?.timezone), pts: 10 },
    { id: 'email', label: 'E-mail verificado', done: Boolean(apiUser?.email_verified_at), pts: 25 },
    { id: 'mfa', label: 'Ativar autenticação em dois fatores', done: Boolean(apiUser?.mfa_enabled), pts: 25 }
  ];
  const done = steps.filter((i) => i.done).length;
  const pts = steps.filter((i) => i.done).reduce((s, i) => s + i.pts, 0);
  const total = steps.reduce((s, i) => s + i.pts, 0);
  const percent = Math.round((pts / total) * 100);

  const saveProfile = useMutation({
    mutationFn: () =>
      updateMe(token, {
        display_name: displayName,
        phone,
        bio,
        timezone,
        locale: 'pt-BR'
      }),
    onSuccess: (user) => {
      onUser(user);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Perfil atualizado');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar')
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadAvatar(token, file),
    onSuccess: (user) => {
      onUser(user);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Foto atualizada');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha no upload')
  });

  const remove = useMutation({
    mutationFn: () => deleteAvatar(token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Foto removida');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao remover')
  });

  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_AVATAR_BYTES) {
        toast.error('A imagem deve ter no máximo 5 MB.');
        return;
      }
      upload.mutate(file);
    },
    [upload]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/gif': [], 'image/webp': [] },
    maxFiles: 1,
    disabled: upload.isPending
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Perfil</CardTitle>
              <CardDescription>
                {done} de {steps.length} etapas concluídas
              </CardDescription>
            </div>
            <Badge variant={percent === 100 ? 'default' : 'secondary'} className="tabular-nums">
              {percent}% completo
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress value={percent} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {steps.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className={cn(item.done && 'text-muted-foreground line-through')}>{item.label}</span>
                {item.done ? (
                  <CheckIcon className="text-primary size-4 shrink-0" />
                ) : (
                  <Badge variant="outline">+{item.pts}</Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Foto de perfil</CardTitle>
          <CardDescription>Esta foto aparece para a equipe e nos comentários.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            {...getRootProps()}
            className={cn(
              'flex flex-col items-center gap-4 rounded-xl border border-dashed p-6 sm:flex-row sm:items-start',
              isDragActive && 'border-primary bg-primary/5'
            )}
          >
            <input {...getInputProps()} />
            <Avatar className="size-24">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
              <AvatarFallback className="text-2xl">{initials(name || email)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-3 sm:items-start">
              <div className="text-center sm:text-left">
                <p className="font-medium">{name || email}</p>
                <p className="text-muted-foreground text-sm">
                  JPEG, PNG, GIF ou WebP. Máximo 5 MB. Recomendado 400 × 400 px.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                <Button type="button" variant="outline" onClick={open} disabled={upload.isPending}>
                  <UploadIcon />
                  {upload.isPending ? 'Enviando...' : 'Enviar foto'}
                </Button>
                {apiUser?.has_avatar && (
                  <Button type="button" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
                    <ImageIcon />
                    Usar iniciais
                  </Button>
                )}
                {apiUser?.has_avatar && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    <Trash2Icon />
                    Remover
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações básicas</CardTitle>
          <CardDescription>O e-mail é gerenciado pela plataforma e não pode ser alterado aqui.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
            <Label htmlFor="display-name">Nome completo</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como você quer ser chamado"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
            <Label>E-mail</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={email} disabled className="flex-1" />
              {apiUser?.email_verified_at ? (
                <Badge variant="outline" className="gap-1">
                  <CheckIcon className="size-3" />
                  Verificado
                </Badge>
              ) : (
                <Badge variant="secondary">Pendente</Badge>
              )}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-0000"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-start">
            <Label htmlFor="bio" className="sm:mt-2">
              Bio
            </Label>
            <div className="grid gap-1.5">
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={280}
                rows={4}
                placeholder="Uma linha sobre você e o que você faz."
              />
              <p className="text-muted-foreground text-right text-xs tabular-nums">{bio.length}/280</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
            <Label>Fuso horário</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(timezones.some((tz) => tz.value === timezone)
                  ? timezones
                  : [...timezones, { value: timezone, label: timezone }]
                ).map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t text-xs">
          <p>
            Membro desde {formatDate(apiUser?.created_at)}
            {apiUser?.updated_at ? ` · Atualizado em ${formatDate(apiUser.updated_at)}` : ''}
          </p>
          <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
            <UserIcon />
            {saveProfile.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
