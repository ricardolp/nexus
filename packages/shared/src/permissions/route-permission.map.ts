import { Permission } from './permission.type';

export interface RoutePermissionRule {
  method: string;
  pattern: RegExp;
  permission: Permission | null;
}

export const ROUTE_PERMISSION_RULES: RoutePermissionRule[] = [
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+$/,
    permission: 'organization:read',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/roles$/,
    permission: 'organization:roles:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/roles$/,
    permission: 'organization:roles:create',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/roles\/[^/]+\/permissions$/,
    permission: 'organization:roles:update',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/members$/,
    permission: 'organization:members:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/members$/,
    permission: 'organization:members:create',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/members\/[^/]+$/,
    permission: 'organization:members:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies$/,
    permission: 'organization:companies:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies$/,
    permission: 'organization:companies:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+$/,
    permission: 'organization:companies:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+$/,
    permission: 'organization:companies:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+$/,
    permission: 'organization:companies:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe$/,
    permission: 'organization:documents:nfe:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfe$/,
    permission: 'organization:documents:nfe:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/events$/,
    permission: 'organization:documents:nfe:events:read',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/events\/[^/]+$/,
    permission: 'organization:documents:nfe:events:read',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+$/,
    permission: 'organization:documents:nfe:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+$/,
    permission: 'organization:documents:nfe:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+$/,
    permission: 'organization:documents:nfe:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/events$/,
    permission: 'organization:documents:nfe:events:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/events$/,
    permission: 'organization:documents:nfe:events:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/items$/,
    permission: 'organization:documents:nfe:items:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/items$/,
    permission: 'organization:documents:nfe:items:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/items\/[^/]+$/,
    permission: 'organization:documents:nfe:items:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/items\/[^/]+$/,
    permission: 'organization:documents:nfe:items:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/items\/[^/]+$/,
    permission: 'organization:documents:nfe:items:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/timeline$/,
    permission: 'organization:documents:nfe:timeline:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/timeline$/,
    permission: 'organization:documents:nfe:timeline:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/timeline\/[^/]+$/,
    permission: 'organization:documents:nfe:timeline:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/timeline\/[^/]+$/,
    permission: 'organization:documents:nfe:timeline:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/timeline\/[^/]+$/,
    permission: 'organization:documents:nfe:timeline:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/attachments$/,
    permission: 'organization:documents:nfe:attachments:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/attachments$/,
    permission: 'organization:documents:nfe:attachments:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/attachments\/[^/]+$/,
    permission: 'organization:documents:nfe:attachments:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/attachments\/[^/]+$/,
    permission: 'organization:documents:nfe:attachments:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/attachments\/[^/]+$/,
    permission: 'organization:documents:nfe:attachments:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfe:inbound-process:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfe:inbound-process:create',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfe:inbound-process:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfe:inbound-process:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/sap-documents$/,
    permission: 'organization:documents:nfe:sap-documents:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/sap-documents$/,
    permission: 'organization:documents:nfe:sap-documents:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/sap-documents\/[^/]+$/,
    permission: 'organization:documents:nfe:sap-documents:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/sap-documents\/[^/]+$/,
    permission: 'organization:documents:nfe:sap-documents:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/sap-documents\/[^/]+$/,
    permission: 'organization:documents:nfe:sap-documents:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse$/,
    permission: 'organization:documents:nfse:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfse$/,
    permission: 'organization:documents:nfse:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+$/,
    permission: 'organization:documents:nfse:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+$/,
    permission: 'organization:documents:nfse:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+$/,
    permission: 'organization:documents:nfse:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/events$/,
    permission: 'organization:documents:nfse:events:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/events$/,
    permission: 'organization:documents:nfse:events:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/items$/,
    permission: 'organization:documents:nfse:items:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/items$/,
    permission: 'organization:documents:nfse:items:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/items\/[^/]+$/,
    permission: 'organization:documents:nfse:items:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/items\/[^/]+$/,
    permission: 'organization:documents:nfse:items:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/items\/[^/]+$/,
    permission: 'organization:documents:nfse:items:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/timeline$/,
    permission: 'organization:documents:nfse:timeline:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/timeline$/,
    permission: 'organization:documents:nfse:timeline:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/timeline\/[^/]+$/,
    permission: 'organization:documents:nfse:timeline:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/timeline\/[^/]+$/,
    permission: 'organization:documents:nfse:timeline:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/timeline\/[^/]+$/,
    permission: 'organization:documents:nfse:timeline:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/attachments$/,
    permission: 'organization:documents:nfse:attachments:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/attachments$/,
    permission: 'organization:documents:nfse:attachments:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/attachments\/[^/]+$/,
    permission: 'organization:documents:nfse:attachments:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/attachments\/[^/]+$/,
    permission: 'organization:documents:nfse:attachments:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/attachments\/[^/]+$/,
    permission: 'organization:documents:nfse:attachments:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfse:inbound-process:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfse:inbound-process:create',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfse:inbound-process:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/inbound-process$/,
    permission: 'organization:documents:nfse:inbound-process:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/sap-documents$/,
    permission: 'organization:documents:nfse:sap-documents:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/sap-documents$/,
    permission: 'organization:documents:nfse:sap-documents:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/sap-documents\/[^/]+$/,
    permission: 'organization:documents:nfse:sap-documents:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/sap-documents\/[^/]+$/,
    permission: 'organization:documents:nfse:sap-documents:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/documents\/nfse\/[^/]+\/sap-documents\/[^/]+$/,
    permission: 'organization:documents:nfse:sap-documents:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe$/,
    permission: 'organization:companies:number-ranges:nfe:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe$/,
    permission: 'organization:companies:number-ranges:nfe:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfe:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfe:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfe:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe\/[^/]+\/events$/,
    permission: 'organization:companies:number-ranges:nfe:events:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe\/[^/]+\/events$/,
    permission: 'organization:companies:number-ranges:nfe:events:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfe\/[^/]+\/events\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfe:events:read',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config$/,
    permission: 'organization:companies:documents:nfe:flow-config:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config$/,
    permission: 'organization:companies:documents:nfe:flow-config:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config\/[^/]+$/,
    permission: 'organization:companies:documents:nfe:flow-config:read',
  },
  {
    method: 'PUT',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config\/[^/]+\/draft$/,
    permission: 'organization:companies:documents:nfe:flow-config:update',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config\/[^/]+\/publish$/,
    permission: 'organization:companies:documents:nfe:flow-config:publish',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config\/[^/]+\/duplicate$/,
    permission: 'organization:companies:documents:nfe:flow-config:create',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config\/[^/]+\/test$/,
    permission: 'organization:companies:documents:nfe:flow-config:test',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/documents\/nfe\/flow-config\/[^/]+\/history$/,
    permission: 'organization:companies:documents:nfe:flow-config:read',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/documents\/nfe\/[^/]+\/flow-instance$/,
    permission: 'organization:companies:documents:nfe:flow-config:read',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse$/,
    permission: 'organization:companies:number-ranges:nfse:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse$/,
    permission: 'organization:companies:number-ranges:nfse:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfse:read',
  },
  {
    method: 'PATCH',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfse:update',
  },
  {
    method: 'DELETE',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfse:delete',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse\/[^/]+\/events$/,
    permission: 'organization:companies:number-ranges:nfse:events:read',
  },
  {
    method: 'POST',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse\/[^/]+\/events$/,
    permission: 'organization:companies:number-ranges:nfse:events:create',
  },
  {
    method: 'GET',
    pattern: /^\/organization\/[^/]+\/companies\/[^/]+\/number-ranges\/nfse\/[^/]+\/events\/[^/]+$/,
    permission: 'organization:companies:number-ranges:nfse:events:read',
  },
];

export function resolveRoutePermission(
  method: string,
  path: string,
): Permission | null {
  const normalizedPath = path.split('?')[0] ?? path;

  for (const rule of ROUTE_PERMISSION_RULES) {
    if (
      rule.method === method.toUpperCase() &&
      rule.pattern.test(normalizedPath)
    ) {
      return rule.permission;
    }
  }

  return null;
}
