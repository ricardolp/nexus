import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, JwtProvider } from '@nexus/auth';
import { sign, verify, type SignOptions } from 'jsonwebtoken';

@Injectable()
export class JwtTokenProvider implements JwtProvider {
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('JWT_SECRET') ?? 'change-me-in-production';
    this.expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '1d';
  }

  async sign(payload: JwtPayload): Promise<string> {
    const options: SignOptions = { expiresIn: this.expiresIn as SignOptions['expiresIn'] };
    return sign(payload, this.secret, options);
  }

  async verify(token: string): Promise<JwtPayload> {
    return verify(token, this.secret) as JwtPayload;
  }
}
