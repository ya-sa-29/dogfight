import { describe, expect, test } from "vitest";
import { createTokenBucket } from "../../shared/../server/src/token-bucket.js";

describe("TokenBucket", () => {
    test("bucket starts full", () => {
        const bucket = createTokenBucket({ refillRate: 10, burst: 5 });
        expect(bucket.getTokens()).toBe(5);
    });

    test("consume returns true when tokens available", () => {
        const bucket = createTokenBucket({ refillRate: 10, burst: 5 });
        expect(bucket.consume()).toBe(true);
        expect(bucket.consume()).toBe(true);
        expect(bucket.consume()).toBe(true);
        expect(bucket.consume()).toBe(true);
        expect(bucket.consume()).toBe(true);
    });

    test("consume returns false when bucket empty", () => {
        const bucket = createTokenBucket({ refillRate: 10, burst: 1 });
        bucket.consume();
        expect(bucket.consume()).toBe(false);
    });

    test("bucket refills over time", () => {
        let now = 0;
        const bucket = createTokenBucket({
            refillRate: 10,
            burst: 5,
            now: () => now,
        });
        bucket.consume();
        bucket.consume();
        expect(bucket.getTokens()).toBe(3);

        now += 500; // 0.5 seconds -> 5 tokens refilled, capped at burst
        expect(bucket.getTokens()).toBe(5);
    });

    test("bucket caps at burst", () => {
        let now = 0;
        const bucket = createTokenBucket({
            refillRate: 1000,
            burst: 5,
            now: () => now,
        });
        bucket.consume();
        now += 10000; // 10 seconds, way more than burst
        expect(bucket.getTokens()).toBe(5);
    });

    test("throws on invalid refillRate", () => {
        expect(() => createTokenBucket({ refillRate: 0, burst: 5 })).toThrow();
        expect(() => createTokenBucket({ refillRate: -1, burst: 5 })).toThrow();
        expect(() =>
            createTokenBucket({ refillRate: NaN, burst: 5 }),
        ).toThrow();
    });

    test("throws on invalid burst", () => {
        expect(() => createTokenBucket({ refillRate: 10, burst: 0 })).toThrow();
        expect(() =>
            createTokenBucket({ refillRate: 10, burst: -1 }),
        ).toThrow();
    });

    test("now is injectable for deterministic testing", () => {
        let now = 1000;
        const bucket = createTokenBucket({
            refillRate: 10,
            burst: 10,
            now: () => now,
        });
        expect(bucket.getTokens()).toBe(10);
        now += 5000; // 5 seconds -> 50 tokens, capped at burst 10
        expect(bucket.getTokens()).toBe(10);
    });
});
