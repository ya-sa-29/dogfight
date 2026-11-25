import { describe, expect, test } from "vitest";
import { mulberry32, SeededRNG, createRNG } from "../../shared/rng/mulberry32.ts";

describe("mulberry32", () => {
    test("returns deterministic values for same seed", () => {
        const rng1 = mulberry32(42);
        const rng2 = mulberry32(42);
        expect(rng1()).toBe(rng2());
        expect(rng1()).toBe(rng2());
    });

    test("returns different values for different seeds", () => {
        const rng1 = mulberry32(1);
        const rng2 = mulberry32(2);
        expect(rng1()).not.toBe(rng2());
    });

    test("returns values in [0, 1)", () => {
        const rng = mulberry32(42);
        for (let i = 0; i < 100; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe("SeededRNG", () => {
    test("constructor defaults seed to 1", () => {
        const rng = new SeededRNG();
        expect(rng.seed).toBe(1);
    });

    test("random returns values in [0, 1)", () => {
        const rng = new SeededRNG(42);
        for (let i = 0; i < 100; i++) {
            const v = rng.random();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test("randomInt returns values in [min, max] inclusive", () => {
        const rng = new SeededRNG(42);
        for (let i = 0; i < 100; i++) {
            const v = rng.randomInt(5, 10);
            expect(v).toBeGreaterThanOrEqual(5);
            expect(v).toBeLessThanOrEqual(10);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    test("randomInt with min equals max returns min", () => {
        const rng = new SeededRNG(42);
        expect(rng.randomInt(7, 7)).toBe(7);
    });

    test("randomFloat returns values in [min, max)", () => {
        const rng = new SeededRNG(42);
        for (let i = 0; i < 100; i++) {
            const v = rng.randomFloat(10, 20);
            expect(v).toBeGreaterThanOrEqual(10);
            expect(v).toBeLessThan(20);
        }
    });

    test("randomSign returns -1 or 1", () => {
        const rng = new SeededRNG(42);
        const signs = new Set();
        for (let i = 0; i < 100; i++) {
            signs.add(rng.randomSign());
        }
        expect(signs.has(-1)).toBe(true);
        expect(signs.has(1)).toBe(true);
        for (const s of signs) {
            expect(s === -1 || s === 1).toBe(true);
        }
    });

    test("two instances with same seed produce same sequence", () => {
        const rng1 = new SeededRNG(12345);
        const rng2 = new SeededRNG(12345);
        for (let i = 0; i < 10; i++) {
            expect(rng1.random()).toBe(rng2.random());
            expect(rng1.randomInt(0, 100)).toBe(rng2.randomInt(0, 100));
            expect(rng1.randomFloat(0, 1)).toBeCloseTo(rng2.randomFloat(0, 1));
        }
    });
});

describe("createRNG", () => {
    test("creates a SeededRNG instance", () => {
        const rng = createRNG(42);
        expect(rng).toBeInstanceOf(SeededRNG);
        expect(rng.seed).toBe(42);
    });
});



