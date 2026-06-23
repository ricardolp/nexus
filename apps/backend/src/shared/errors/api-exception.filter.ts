import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  DomainError,
  ValidationError,
  ValidationException,
} from '@nexus/shared';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

type ApiErrorResponse = {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const payload = this.toErrorResponse(exception);
    response.status(payload.statusCode).json(payload);
  }

  private toErrorResponse(exception: unknown): ApiErrorResponse {
    if (exception instanceof ValidationException) {
      return {
        statusCode: exception.statusCode,
        error: 'ValidationException',
        message: exception.message,
        details: exception.errors.map((error) => error.message),
      };
    }

    if (exception instanceof ValidationError) {
      return {
        statusCode: exception.statusCode,
        error: 'ValidationError',
        message: exception.message,
      };
    }

    if (exception instanceof DomainError) {
      return {
        statusCode: exception.statusCode,
        error: exception.name,
        message: exception.message,
      };
    }

    const domainLikeError = this.getDomainLikeError(exception);
    if (domainLikeError) {
      return domainLikeError;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = Array.isArray(exception.meta?.target)
          ? exception.meta.target.join(', ')
          : 'campo';

        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'ConflictError',
          message: `Registro duplicado para ${target}`,
        };
      }

      if (exception.code === 'P2003') {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'ReferenceError',
          message: 'Referência inválida para o registro informado',
        };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      return {
        statusCode: status,
        error: exception.name,
        message:
          typeof body === 'string'
            ? body
            : ((body as { message?: string | string[] }).message?.toString() ??
              'Request failed'),
        details: typeof body === 'object' ? body : undefined,
      };
    }

    this.logger.error('Unhandled exception', exception);

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Internal server error',
    };
  }

  private getDomainLikeError(exception: unknown): ApiErrorResponse | null {
    if (typeof exception !== 'object' || exception === null) {
      return null;
    }

    const candidate = exception as {
      statusCode?: unknown;
      message?: unknown;
      name?: unknown;
      errors?: Array<{ message?: string }>;
    };

    if (
      typeof candidate.statusCode !== 'number' ||
      typeof candidate.message !== 'string'
    ) {
      return null;
    }

    if (candidate.name === 'ValidationException' && Array.isArray(candidate.errors)) {
      return {
        statusCode: candidate.statusCode,
        error: 'ValidationException',
        message: candidate.message,
        details: candidate.errors
          .map((error) => error.message)
          .filter((message): message is string => Boolean(message)),
      };
    }

    return {
      statusCode: candidate.statusCode,
      error: typeof candidate.name === 'string' ? candidate.name : 'DomainError',
      message: candidate.message,
    };
  }
}
