export const resourceLabels: Record<string, string> = {
  organization: 'Organização',
  member: 'Membros',
  role: 'Perfis de acesso',
  company: 'Empresas (CNPJs)',
  nfe: 'NF-e',
  nfse: 'NFS-e',
  nfe_inbound: 'NF-e de entrada',
  integration: 'Integrações',
  webhook: 'Webhooks',
  audit: 'Auditoria',
  document_payload: 'Conteúdo de documentos'
};

export const actionLabels: Record<string, string> = {
  read: 'Visualizar',
  read_sensitive: 'Visualizar dados sensíveis',
  update: 'Editar',
  create: 'Criar',
  cancel: 'Cancelar',
  invite: 'Convidar',
  suspend: 'Suspender',
  manage: 'Gerenciar'
};

export function groupPermissions(permissions: string[]) {
  const groups = new Map<string, string[]>();
  for (const permission of permissions) {
    const [resource] = permission.split(':');
    const list = groups.get(resource) ?? [];
    list.push(permission);
    groups.set(resource, list);
  }
  return Array.from(groups.entries()).map(([resource, perms]) => ({
    resource,
    label: resourceLabels[resource] ?? resource,
    permissions: perms
  }));
}

export function permissionLabel(permission: string) {
  const [, action] = permission.split(':');
  return actionLabels[action] ?? action;
}
