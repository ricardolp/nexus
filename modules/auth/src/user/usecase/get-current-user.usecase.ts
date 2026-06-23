import { NotFoundError, UseCase } from '@nexus/shared';
import { UserRepository } from '../provider';

export interface GetCurrentUserIn {
  userId: string;
}

export interface GetCurrentUserOut {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  role: string;
}

export class GetCurrentUser implements UseCase<GetCurrentUserIn, GetCurrentUserOut> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: GetCurrentUserIn): Promise<GetCurrentUserOut> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    return {
      id: user.id,
      nome: user.nome,
      sobrenome: user.sobrenome,
      email: user.email,
      role: user.role,
    };
  }
}
