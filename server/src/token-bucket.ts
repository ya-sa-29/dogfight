/**
 * A per-connection token bucket.
 *
 * The bucket starts full and refills continuously at `refillRate` tokens per
 * second, capped at `burst`. `consume()` deducts one token and returns true
 * when a token was available, false otherwise.
 *
 * `now` is injectable so tests can drive the clock deterministically instead
 * of sleeping in real time.
 */
export interface TokenBucketConfig {
    refillRate: number;
    burst: number;
    now?: () => number;
}

export interface TokenBucket {
    consume(): boolean;
    getTokens(): number;
}

export function createTokenBucket({ refillRate, burst, now = () => Date.now() }: TokenBucketConfig): TokenBucket {
    if (!Number.isFinite(refillRate) || refillRate <= 0) {
        throw new Error('refillRate must be a positive number');
    }

    if (!Number.isFinite(burst) || burst <= 0) {
        throw new Error('burst must be a positive number');
    }

    let tokens = burst;
    let lastRefill = now();

    function refill(): void {
        const current = now();
        const elapsed = Math.max(0, (current - lastRefill) / 1000);
        lastRefill = current;

        tokens = Math.min(burst, tokens + elapsed * refillRate);
    }

    return {
        consume(): boolean {
            refill();

            if (tokens < 1) {
                return false;
            }

            tokens -= 1;
            return true;
        },

        getTokens(): number {
            refill();
            return tokens;
        },
    };
}