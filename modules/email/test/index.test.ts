import { EmailLog, SendTransactionalEmail } from '../src';

test('exports email domain', () => {
  expect(EmailLog).toBeDefined();
  expect(SendTransactionalEmail).toBeDefined();
});
