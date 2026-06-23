import {
  EmailRule,
  InRule,
  MinLengthRule,
  UuidRule,
  ValidationException,
} from '@nexus/shared';
import { User } from '../../../src/user/model/user.entity';

function getValidationMessages(callback: () => void): string[] {
  try {
    callback();
    return [];
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }
}

describe('User', () => {
  const validProps = {
    nome: 'Maria',
    sobrenome: 'Silva',
    email: 'maria@example.com',
    senha: 'senha-forte',
    role: 'member' as const,
  };

  test('deve criar usuario valido com id e timestamps', () => {
    const user = new User(validProps);

    expect(user.nome).toBe('Maria');
    expect(user.sobrenome).toBe('Silva');
    expect(user.email).toBe('maria@example.com');
    expect(user.senha).toBe('senha-forte');
    expect(user.role).toBe('member');
    expect(user.emailConfirmadoEm).toBeUndefined();
    expect(user.ultimoLoginEm).toBeUndefined();
    expect(user.id).toEqual(expect.any(String));
    expect(new UuidRule().validate(user.id)).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    expect(user.deletedAt).toBeNull();
  });

  test('deve manter campos opcionais informados', () => {
    const emailConfirmadoEm = new Date('2024-01-01T10:00:00.000Z');
    const ultimoLoginEm = new Date('2024-06-01T10:00:00.000Z');
    const user = new User({
      ...validProps,
      role: 'admin',
      emailConfirmadoEm,
      ultimoLoginEm,
    });

    expect(user.role).toBe('admin');
    expect(user.emailConfirmadoEm?.getTime()).toBe(emailConfirmadoEm.getTime());
    expect(user.ultimoLoginEm?.getTime()).toBe(ultimoLoginEm.getTime());
  });

  test('deve clonar usuario preservando id e createdAt', () => {
    const user = new User(validProps);
    const cloned = user.clone({ nome: 'Ana' });

    expect(cloned.id).toBe(user.id);
    expect(cloned.createdAt.getTime()).toBe(user.createdAt.getTime());
    expect(cloned.nome).toBe('Ana');
    expect(cloned.updatedAt.getTime()).toBeGreaterThanOrEqual(user.updatedAt.getTime());
  });

  test('deve validar usuario com sucesso', () => {
    const user = new User(validProps);

    expect(() => user.validate()).not.toThrow();
  });

  test('deve falhar quando nome for invalido', () => {
    const messages = getValidationMessages(() =>
      new User({ ...validProps, nome: 'A' }).validate(),
    );

    expect(messages.some((message) => message.includes('user.nome'))).toBe(true);
    expect(new MinLengthRule(2).validate('A')).not.toBeNull();
  });

  test('deve falhar quando email for invalido', () => {
    const messages = getValidationMessages(() =>
      new User({ ...validProps, email: 'invalido' }).validate(),
    );

    expect(messages.some((message) => message.includes('user.email'))).toBe(true);
    expect(new EmailRule().validate('invalido')).not.toBeNull();
  });

  test('deve falhar quando senha for curta', () => {
    const messages = getValidationMessages(() =>
      new User({ ...validProps, senha: '123' }).validate(),
    );

    expect(messages.some((message) => message.includes('user.senha'))).toBe(true);
  });

  test('deve falhar quando role for invalida', () => {
    const messages = getValidationMessages(() =>
      new User({ ...validProps, role: 'owner' as 'member' }).validate(),
    );

    expect(messages.some((message) => message.includes('user.role'))).toBe(true);
    expect(new InRule(['member', 'admin']).validate('owner')).not.toBeNull();
  });
});
