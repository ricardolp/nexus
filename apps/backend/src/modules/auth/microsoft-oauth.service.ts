import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';

interface MicrosoftProfile {
  email: string;
  nome: string;
  sobrenome: string;
}

interface MicrosoftTokenResponse {
  access_token: string;
}

interface MicrosoftGraphUser {
  mail?: string | null;
  userPrincipalName?: string;
  givenName?: string | null;
  surname?: string | null;
  displayName?: string | null;
}

@Injectable()
export class MicrosoftOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenantId: string;
  private readonly redirectUri: string;
  private readonly stateSecret: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID') ?? '';
    this.clientSecret =
      this.configService.get<string>('MICROSOFT_CLIENT_SECRET') ?? '';
    this.tenantId =
      this.configService.get<string>('MICROSOFT_TENANT_ID') ?? 'common';
    this.redirectUri =
      this.configService.get<string>('MICROSOFT_REDIRECT_URI') ??
      'http://localhost:4000/auth/microsoft/callback';
    this.stateSecret =
      this.configService.get<string>('JWT_SECRET') ?? 'change-me-in-production';
    this.enabled = Boolean(this.clientId && this.clientSecret);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getAuthorizationUrl(): string {
    if (!this.enabled) {
      throw new UnauthorizedException('Login com Microsoft não configurado');
    }

    const state = this.createState();
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email User.Read offline_access',
      state,
    });

    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<MicrosoftProfile> {
    if (!this.enabled) {
      throw new UnauthorizedException('Login com Microsoft não configurado');
    }

    if (!code || !this.verifyState(state)) {
      throw new UnauthorizedException('Estado OAuth inválido');
    }

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('Falha ao autenticar com Microsoft');
    }

    const tokenData = (await tokenResponse.json()) as MicrosoftTokenResponse;
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new UnauthorizedException('Falha ao obter perfil Microsoft');
    }

    const profile = (await profileResponse.json()) as MicrosoftGraphUser;
    const email = (profile.mail ?? profile.userPrincipalName ?? '')
      .trim()
      .toLowerCase();

    if (!email) {
      throw new UnauthorizedException('E-mail Microsoft não disponível');
    }

    const displayName = profile.displayName?.trim() ?? '';
    const nome = profile.givenName?.trim() || displayName.split(' ')[0] || 'Usuário';
    const sobrenome =
      profile.surname?.trim() ||
      displayName.split(' ').slice(1).join(' ') ||
      'Microsoft';

    return { email, nome, sobrenome };
  }

  private createState(): string {
    const nonce = randomBytes(16).toString('hex');
    const signature = createHmac('sha256', this.stateSecret)
      .update(nonce)
      .digest('hex');
    return `${nonce}.${signature}`;
  }

  private verifyState(state: string): boolean {
    const [nonce, signature] = state.split('.');
    if (!nonce || !signature) {
      return false;
    }

    const expected = createHmac('sha256', this.stateSecret)
      .update(nonce)
      .digest('hex');

    return expected === signature;
  }
}
