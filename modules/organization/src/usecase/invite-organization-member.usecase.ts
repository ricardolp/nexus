import {
  AuthToken,
  AuthTokenRepository,
  UserRepository,
  generateRawToken,
  hashToken,
} from '@nexus/auth';
import { TransactionalEmailProvider } from '@nexus/email';
import {
  DEFAULT_ORGANIZATION_TI_ROLE,
  ForbiddenError,
  NotFoundError,
  UseCase,
  ValidationError,
} from '@nexus/shared';
import { OrganizationMember } from '../organization-member/model';
import { OrganizationMemberRepository } from '../organization-member/provider';
import { OrganizationRoleRepository } from '../organization-role/provider';
import { AddOrganizationMember } from './add-organization-member.usecase';

export interface InviteOrganizationMemberIn {
  organizationId: string;
  email: string;
  invitedBy: string;
  actorRole: string;
}

export type InviteOrganizationMemberOut =
  | { action: 'invited' }
  | { action: 'linked'; member: OrganizationMember };

const TOKEN_TTL_HOURS = 72;

export class InviteOrganizationMember
  implements UseCase<InviteOrganizationMemberIn, InviteOrganizationMemberOut>
{
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly transactionalEmail: TransactionalEmailProvider,
    private readonly organizationRoleRepository: OrganizationRoleRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly appUrl: string,
  ) {}

  async execute(
    input: InviteOrganizationMemberIn,
  ): Promise<InviteOrganizationMemberOut> {
    if (input.actorRole !== 'admin') {
      throw new ForbiddenError(
        'Somente administradores podem convidar membros para organizações',
      );
    }

    const tiRole = await this.organizationRoleRepository.findByOrganizationAndSlug(
      input.organizationId,
      DEFAULT_ORGANIZATION_TI_ROLE.slug,
    );

    if (!tiRole) {
      throw new NotFoundError(
        'Role TI não encontrada nesta organização. Crie a organização novamente ou configure a role manualmente.',
      );
    }

    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      if (!existingUser.emailConfirmadoEm) {
        throw new ValidationError(
          'Usuário precisa confirmar o e-mail antes de ser vinculado',
        );
      }

      const member = await new AddOrganizationMember(
        this.organizationMemberRepository,
        this.organizationRoleRepository,
        this.userRepository,
      ).execute({
        organizationId: input.organizationId,
        userId: existingUser.id,
        roleId: tiRole.id,
      });

      return { action: 'linked', member };
    }

    const rawToken = generateRawToken();
    const authToken = new AuthToken({
      tipo: 'invite',
      email: input.email,
      tokenHash: hashToken(rawToken),
      expiresAt: this.expiresAt(),
      metadados: {
        invitedBy: input.invitedBy,
        role: 'member',
        organizationId: input.organizationId,
        organizationRoleId: tiRole.id,
      },
    });

    authToken.validate();
    await this.authTokenRepository.create(authToken);

    await this.transactionalEmail.send({
      template: 'invite',
      to: input.email,
      variables: {
        inviteUrl: `${this.appUrl}/auth/invite?token=${rawToken}`,
        invitedBy: input.invitedBy,
        expiresIn: `${TOKEN_TTL_HOURS} horas`,
      },
      metadata: { email: input.email },
    });

    return { action: 'invited' };
  }

  private expiresAt(): Date {
    const date = new Date();
    date.setHours(date.getHours() + TOKEN_TTL_HOURS);
    return date;
  }
}
