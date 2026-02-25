export type DomainErrorCode =
  | "CLI_UNKNOWN"
  | "CLI_INVALID_ARGUMENT"
  | "CLI_MISSING_OPTION_VALUE"
  | "CLI_SIGNING_CREDENTIALS_MISSING"
  | "CLI_NETWORK_ERROR"
  | "CLI_HTTP_ERROR"
  | "CLI_OPERATION_FAILED"
  | string;

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(code: DomainErrorCode, message: string, options?: { details?: unknown; cause?: unknown }) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

export function normalizeUnknownError(err: unknown): DomainError {
  if (isDomainError(err)) {
    return err;
  }
  if (err instanceof Error) {
    return new DomainError("CLI_UNKNOWN", err.message, { cause: err });
  }
  return new DomainError("CLI_UNKNOWN", String(err));
}

export function formatDomainError(err: DomainError): string {
  return `[${err.code}] ${err.message}`;
}

