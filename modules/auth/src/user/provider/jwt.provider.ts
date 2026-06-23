export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface JwtProvider {
  sign(payload: JwtPayload): Promise<string>;
  verify(token: string): Promise<JwtPayload>;
}
