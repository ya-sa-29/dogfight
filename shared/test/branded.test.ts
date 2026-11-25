import { describe, expect, test } from "vitest";
import {
    asEntityId,
    asTick,
    asSeq,
    asRadians,
    isEntityId,
    isTick,
    isSeq,
    isRadians,
} from "../../shared/sim/branded.ts";

describe("asEntityId", () => {
    test("creates a branded entity id", () => {
        const id = asEntityId(42);
        expect(id).toBe(42);
        expect(isEntityId(id)).toBe(true);
    });

    test("rejects negative numbers", () => {
        expect(isEntityId(-1)).toBe(false);
    });

    test("rejects non-integers", () => {
        expect(isEntityId(3.14)).toBe(false);
    });

    test("rejects non-numbers", () => {
        expect(isEntityId("42")).toBe(false);
        expect(isEntityId(null)).toBe(false);
        expect(isEntityId(undefined)).toBe(false);
    });
});

describe("asTick", () => {
    test("creates a branded tick", () => {
        const tick = asTick(100);
        expect(tick).toBe(100);
        expect(isTick(tick)).toBe(true);
    });

    test("rejects negative numbers", () => {
        expect(isTick(-1)).toBe(false);
    });

    test("rejects non-integers", () => {
        expect(isTick(3.14)).toBe(false);
    });
});

describe("asSeq", () => {
    test("creates a branded sequence number", () => {
        const seq = asSeq(5);
        expect(seq).toBe(5);
        expect(isSeq(seq)).toBe(true);
    });

    test("rejects negative numbers", () => {
        expect(isSeq(-1)).toBe(false);
    });

    test("rejects non-integers", () => {
        expect(isSeq(3.14)).toBe(false);
    });
});

describe("asRadians", () => {
    test("creates a branded radians value", () => {
        const angle = asRadians(Math.PI);
        expect(angle).toBe(Math.PI);
    });

    test("accepts any number including negative", () => {
        const angle = asRadians(-Math.PI / 2);
        expect(angle).toBe(-Math.PI / 2);
    });
});



