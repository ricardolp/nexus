import { RegisterUser, User } from '../src';

test('exports auth domain', () => {
  expect(RegisterUser).toBeDefined();
  expect(User).toBeDefined();
});
