
class HttpError extends Error {
    constructor(status, url) {
        super(`HTTP ${status}: ${url}`);
        this.name = "HttpError";
        this.status = status;
    }
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }
}

function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        throwIfAborted(signal);

        const timer = setTimeout(resolve, ms);

        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(
                    signal.reason ?? new DOMException("Aborted", "AbortError"),
                );
            },
            { once: true },
        );
    });
}

export async function withRetry(
    task,
    { retries = 2, baseDelay = 300, signal } = {},
) {
    for (let attempt = 0; ; attempt++) {
        throwIfAborted(signal);

        try {
            return await task(signal);
        } catch (error) {
            const isClientError =
                error instanceof HttpError &&
                error.status >= 400 &&
                error.status < 500;

            const isAbort = error.name === "AbortError";

            if (isClientError || isAbort || attempt >= retries) {
                throw error;
            }

            const backoff = baseDelay * 2 ** attempt;
            const jitter = Math.random() * baseDelay;

            await delay(backoff + jitter, signal);
        }
    }
}

export async function fetchJson(url, { signal } = {}) {
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

export function loadJson(url, options = {}) {
    return withRetry(
        (signal) => fetchJson(url, { signal }),
        options,
    );
}


export function loadImage(url, options = {}) {
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
export function loadAudio(url, audioContext, options = {}) {
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
    manifest,
    { audioContext, signal, onProgress } = {},
) {
    const resources = [
        ...Object.entries(manifest.images ?? {}).map(([name, url]) => ({
            type: "images",
            name,
            url,
        })),
        ...Object.entries(manifest.audio ?? {}).map(([name, url]) => ({
            type: "audio",
            name,
            url,
        })),
        ...Object.entries(manifest.json ?? {}).map(([name, url]) => ({
            type: "json",
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
                let value;

                if (type === "images") {
                    value = await loadImage(url, { signal });
                } else if (type === "audio") {
                    if (!audioContext) {
                        throw new Error(
                            "AudioContext is required to load audio",
                        );
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
                        total === 0
                            ? 100
                            : Math.round((loaded / total) * 100),
                });
            }
        }),
    );

    return Object.fromEntries(
        results.map(({ name, value }) => [name, value]),
    );
}
