export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 413 | 415,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
