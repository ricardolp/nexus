import { getModuleName } from '../src';

describe('@nexus/integration', () => {
  it('should expose module name', () => {
    expect(getModuleName()).toBe('integration');
  });
});
