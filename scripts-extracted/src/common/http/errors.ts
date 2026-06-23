export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number = 400,
    options?: { cause?: unknown }
  ) {
    super(code);
    this.name = "AppError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
