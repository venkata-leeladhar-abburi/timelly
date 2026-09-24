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
