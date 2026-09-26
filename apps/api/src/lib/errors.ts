export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, 'bad_request', msg, details);

export const unauthorized = (msg = 'Authentication required') =>
  new AppError(401, 'unauthorized', msg);

export const forbidden = (msg = 'You do not have access to this resource') =>
  new AppError(403, 'forbidden', msg);

export const notFound = (msg = 'Resource not found') =>
  new AppError(404, 'not_found', msg);

export const conflict = (msg: string) => new AppError(409, 'conflict', msg);

export const unprocessable = (msg: string, details?: unknown) =>
  new AppError(422, 'unprocessable', msg, details);
