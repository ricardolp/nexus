import { UuidRule, ValidationException } from '@nexus/shared';
import { UserLoginAudit } from '../../../src/user/model/user-login-audit.entity';

function getValidationMessages(callback: () => void): string[] {
  try {
    callback();
    return [];
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }
}

describe('UserLoginAudit', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const loggedInAt = new Date('2024-06-01T10:00:00.000Z');

  test('deve criar auditoria de login valida', () => {
    const audit = new UserLoginAudit({
      userId,
      ipAddress: '192.168.0.1',
      userAgent: 'Mozilla/5.0',
      loggedInAt,
    });

    expect(audit.userId).toBe(userId);
    expect(audit.ipAddress).toBe('192.168.0.1');
    expect(audit.userAgent).toBe('Mozilla/5.0');
    expect(audit.loggedInAt.getTime()).toBe(loggedInAt.getTime());
    expect(new UuidRule().validate(audit.id)).toBeNull();
    expect(audit.deletedAt).toBeNull();
  });

  test('deve aceitar ip e user agent opcionais', () => {
    const audit = new UserLoginAudit({
      userId,
      loggedInAt,
    });

    expect(audit.ipAddress).toBeUndefined();
    expect(audit.userAgent).toBeUndefined();
    expect(() => audit.validate()).not.toThrow();
  });

  test('deve falhar quando userId for invalido', () => {
    const messages = getValidationMessages(() =>
      new UserLoginAudit({
        userId: 'invalido',
        loggedInAt,
      }).validate(),
    );

    expect(messages.some((message) => message.includes('userLoginAudit.userId'))).toBe(true);
  });

  test('deve falhar quando user agent exceder limite', () => {
    const messages = getValidationMessages(() =>
      new UserLoginAudit({
        userId,
        loggedInAt,
        userAgent: 'x'.repeat(513),
      }).validate(),
    );

    expect(messages.some((message) => message.includes('userLoginAudit.userAgent'))).toBe(true);
  });
});
