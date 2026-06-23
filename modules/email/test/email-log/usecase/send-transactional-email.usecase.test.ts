import { SendTransactionalEmail } from '../../../src/email-log/usecase/send-transactional-email.usecase';
import { FakeEmailLogRepository } from '../../mock/fake-email-log.repository';
import { FakeEmailSenderProvider } from '../../mock/fake-email-sender.provider';
import { FakeEmailTemplateRendererProvider } from '../../mock/fake-email-template-renderer.provider';

describe('SendTransactionalEmail', () => {
  it('creates log, sends email and marks log as sent', async () => {
    const emailLogRepository = new FakeEmailLogRepository();
    const emailSender = new FakeEmailSenderProvider();
    const templateRenderer = new FakeEmailTemplateRendererProvider();

    const useCase = new SendTransactionalEmail(
      emailLogRepository,
      templateRenderer,
      emailSender,
    );

    await useCase.execute({
      template: 'welcome',
      to: 'user@example.com',
      variables: { nome: 'Ana', appName: 'Nexus', loginUrl: 'http://localhost' },
    });

    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe('user@example.com');
    expect(emailSender.sent[0]?.subject).toBe('Bem-vindo ao Nexus');

    const page = await emailLogRepository.findPage({ page: 1, perPage: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0]?.status).toBe('sent');
    expect(page.items[0]?.enviadoEm).toBeDefined();
  });

  it('marks log as failed when sender throws', async () => {
    const emailLogRepository = new FakeEmailLogRepository();
    const emailSender = new FakeEmailSenderProvider();
    const templateRenderer = new FakeEmailTemplateRendererProvider();

    emailSender.failOnNext('connection refused');

    const useCase = new SendTransactionalEmail(
      emailLogRepository,
      templateRenderer,
      emailSender,
    );

    await expect(
      useCase.execute({
        template: 'password_reset',
        to: 'user@example.com',
        variables: { nome: 'Ana', resetUrl: 'http://localhost/reset' },
      }),
    ).rejects.toThrow('connection refused');

    const page = await emailLogRepository.findPage({ page: 1, perPage: 10 });
    expect(page.items[0]?.status).toBe('failed');
    expect(page.items[0]?.erro).toBe('connection refused');
  });
});
