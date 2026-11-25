/**
 * Asset loading utilities with retry logic and progress reporting.
 * Supports images, audio, and JSON.
 */

interface RetryOptions {
  readonly retries?: number;
  readonly baseDelay?: number;
  readonly signal?: AbortSignal;
}

interface FetchOptions {
  readonly signal?: AbortSignal;
}

interface LoadAllOptions {
  readonly audioContext?: AudioContext;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ProgressInfo) => void;
}

interface ProgressInfo {
  readonly loaded: number;
  readonly total: number;
  readonly percent: number;
}

interface Manifest {
  readonly images?: Record<string, string>;
  readonly audio?: Record<string, string>;
  readonly json?: Record<string, string>;
}

export type { Manifest };

interface Resource {
  readonly type: "images" | "audio" | "json";
  readonly name: string;
  readonly url: string;
}

class HttpError extends Error {
  public readonly status: number;
  public readonly url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status}: ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function withRetry<T>(
  task: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 2, baseDelay = 300, signal } = options;

  for (let attempt = 0; ; attempt++) {
    throwIfAborted(signal);

    try {
      return await task(signal);
    } catch (error) {
      const isClientError =
        error instanceof HttpError &&
        error.status >= 400 &&
        error.status < 500;

      const isAbort = error instanceof DOMException && error.name === "AbortError";

      if (isClientError || isAbort || attempt >= retries) {
        throw error;
      }

      const backoff = baseDelay * 2 ** attempt;
      const jitter = Math.random() * baseDelay;

      await delay(backoff + jitter, signal);
    }
  }
}

async function fetchJson(url: string, { signal }: FetchOptions = {}): Promise<unknown> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new HttpError(response.status, url);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON but received "${contentType}" from ${url}`,
    );
  }

  return response.json();
}

export function loadJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  return withRetry(
    (signal) => fetchJson(url, { signal }),
    options,
  );
}

export function loadImage(url: string, options: FetchOptions = {}): Promise<HTMLImageElement> {
  return withRetry(async (signal) => {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new HttpError(response.status, url);
    }

    const blob = await response.blob();
    throwIfAborted(signal);

    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    try {
      image.src = objectUrl;
      await image.decode();

      throwIfAborted(signal);

      return image;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, options);
}

export function loadAudio(
  url: string,
  audioContext: AudioContext,
  options: FetchOptions = {},
): Promise<AudioBuffer> {
  return withRetry(async (signal) => {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new HttpError(response.status, url);
    }

    const data = await response.arrayBuffer();
    throwIfAborted(signal);

    const buffer = await audioContext.decodeAudioData(data);
    throwIfAborted(signal);

    return buffer;
  }, options);
}

export async function loadAll(
  manifest: Manifest,
  options: LoadAllOptions = {},
): Promise<Record<string, unknown>> {
  const { audioContext, signal, onProgress } = options;

  const resources: Resource[] = [
    ...Object.entries(manifest.images ?? {}).map(([name, url]) => ({
      type: "images" as const,
      name,
      url,
    })),
    ...Object.entries(manifest.audio ?? {}).map(([name, url]) => ({
      type: "audio" as const,
      name,
      url,
    })),
    ...Object.entries(manifest.json ?? {}).map(([name, url]) => ({
      type: "json" as const,
      name,
      url,
    })),
  ];

  const total = resources.length;
  let loaded = 0;

  onProgress?.({ loaded, total, percent: 0 });

  const results = await Promise.all(
    resources.map(async ({ type, name, url }) => {
      try {
        let value: unknown;

        if (type === "images") {
          value = await loadImage(url, { signal });
        } else if (type === "audio") {
          if (!audioContext) {
            throw new Error("AudioContext is required to load audio");
          }

          value = await loadAudio(url, audioContext, { signal });
        } else {
          value = await loadJson(url, { signal });
        }

        return { name, value };
      } finally {
        loaded++;

        onProgress?.({
          loaded,
          total,
          percent:
            total === 0 ? 100 : Math.round((loaded / total) * 100),
        });
      }
    }),
  );

  return Object.fromEntries(
    results.map(({ name, value }) => [name, value]),
  );
}