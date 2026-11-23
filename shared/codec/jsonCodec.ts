/**
 * JSON codec for protocol messages.
 * Simple wrapper around JSON.stringify/parse with error handling.
 */
export function encode(message: unknown): string {
  return JSON.stringify(message);
}

export function decode(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}