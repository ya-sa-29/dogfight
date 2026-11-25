import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createTokenBucket } from '../src/token-bucket.js';

/**
 * A controllable clock. `advance(seconds)` moves time forward without any real
 * waiting, so bucket behaviour is fully deterministic.
 */
function createFakeClock(startMs = 0) {
    let current = startMs;

    return {
        now: () => current,
        advance(seconds) {
            current += seconds * 1000;
        },
    };
}

describe('createTokenBucket', () => {
    test('starts full at the configured burst', () => {
        const clock = createFakeClock();
        const bucket = createTokenBucket({ refillRate: 10, burst: 20, now: clock.now });

        assert.equal(bucket.getTokens(), 20);
    });

    test('consume() deducts one token while available', () => {
        const clock = createFakeClock();
        const bucket = createTokenBucket({ refillRate: 10, burst: 20, now: clock.now });

        assert.equal(bucket.consume(), true);
        assert.equal(bucket.getTokens(), 19);
    });

    test('refills at the configured rate per second', () => {
        const clock = createFakeClock();
        const bucket = createTokenBucket({ refillRate: 10, burst: 20, now: clock.now });

        for (let i = 0; i < 20; i += 1) {
            assert.equal(bucket.consume(), true);
        }

        assert.equal(bucket.consume(), false, 'bucket is empty');

        clock.advance(1);

        assert.equal(bucket.consume(), true, 'one second refills ten tokens');
    });

    test('refill is capped at the burst size', () => {
        const clock = createFakeClock();
        const bucket = createTokenBucket({ refillRate: 10, burst: 20, now: clock.now });

        for (let i = 0; i < 20; i += 1) {
            bucket.consume();
        }

        clock.advance(3600);

        assert.equal(bucket.getTokens(), 20, 'tokens never exceed the burst');
    });

    test('supports fractional second refills', () => {
        const clock = createFakeClock();
        const bucket = createTokenBucket({ refillRate: 40, burst: 20, now: clock.now });

        for (let i = 0; i < 20; i += 1) {
            bucket.consume();
        }

        clock.advance(0.5);

        // 40/s * 0.5s = 20 tokens, capped at burst 20.
        assert.equal(bucket.getTokens(), 20);
    });

    test('rejects invalid configuration', () => {
        assert.throws(() => createTokenBucket({ refillRate: 0, burst: 20 }));
        assert.throws(() => createTokenBucket({ refillRate: 10, burst: 0 }));
        assert.throws(() => createTokenBucket({ refillRate: Number.NaN, burst: 20 }));
    });
});