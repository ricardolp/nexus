import { CreateOrganization, Organization } from '../src';

test('exports organization domain', () => {
  expect(CreateOrganization).toBeDefined();
  expect(Organization).toBeDefined();
});
