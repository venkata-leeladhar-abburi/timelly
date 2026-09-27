/** Thrown by route handlers that need to signal a specific HTTP status (403, 400, ...) to their catch block. */
export class HttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export function getErrorStatusCode(err: unknown): number | undefined {
  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number"
  ) {
    return (err as { statusCode: number }).statusCode;
  }
  return undefined;
}

export function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return undefined;
}

export function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

export function getErrorMeta(err: unknown): unknown {
  if (err && typeof err === "object" && "meta" in err) {
    return (err as { meta?: unknown }).meta;
  }
  return undefined;
}

export function getErrorStack(err: unknown): string | undefined {
  if (err instanceof Error) return err.stack;
  return undefined;
}

export function getErrorName(err: unknown): string | undefined {
  if (err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string") {
    return (err as { name: string }).name;
  }
  return undefined;
}

/**
 * Message to return to an API client for an unexpected/uncaught error, instead of
 * forwarding `error.message` directly (which can leak internal details — Prisma
 * constraint names, file paths, gateway response bodies — to whoever called the
 * route). See PRODUCTION_READINESS.md's error-handling finding.
 *
 * Not for the many places in this codebase that intentionally `throw new
 * Error("some short user-facing message")` as flow control for an expected,
 * already-validated failure (e.g. "Amount cannot exceed remaining due") — those
 * are written to be shown to the user and should keep using `getErrorMessage`
 * directly. This is specifically for the outermost catch block wrapping a whole
 * route handler, where the error could be anything.
 */
export function toClientErrorMessage(
  err: unknown,
  fallback = "Internal server error"
): string {
  if (process.env.NODE_ENV !== "production") {
    return getErrorMessage(err) || fallback;
  }
  return fallback;
}

export function getErrorMetaTarget(err: unknown): unknown {
  if (
    err &&
    typeof err === "object" &&
    "meta" in err &&
    (err as { meta?: unknown }).meta &&
    typeof (err as { meta?: unknown }).meta === "object"
  ) {
    return (err as { meta: { target?: unknown } }).meta.target;
  }
  return undefined;
}
