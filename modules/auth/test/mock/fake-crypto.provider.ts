import { CryptoProvider } from '../../src/user/provider';

export class FakeCryptoProvider implements CryptoProvider {
  async encrypt(password: string): Promise<string> {
    return `hashed:${password}`;
  }

  async compare(password: string, hashedPassword: string): Promise<boolean> {
    return hashedPassword === `hashed:${password}`;
  }
}
