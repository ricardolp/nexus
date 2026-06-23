import { JwtPayload } from '@nexus/auth';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
