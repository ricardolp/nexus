import { SetMetadata } from '@nestjs/common';
import { Permission } from '@nexus/shared';
import { REQUIRED_PERMISSION_KEY } from '../auth/auth.constants';

export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
