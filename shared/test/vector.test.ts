import { describe, expect, test } from "vitest";
import { Vector2 } from "../../shared/sim/vector.ts";

describe("Vector2", () => {
    test("constructor defaults to zero", () => {
        const v = new Vector2();
        expect(v.x).toBe(0);
        expect(v.y).toBe(0);
    });

    test("constructor sets coordinates", () => {
        const v = new Vector2(3, 4);
        expect(v.x).toBe(3);
        expect(v.y).toBe(4);
    });

    test("add returns new vector without mutating operands", () => {
        const a = new Vector2(1, 2);
        const b = new Vector2(3, 4);
        const c = a.add(b);
        expect(c.x).toBe(4);
        expect(c.y).toBe(6);
        expect(a.x).toBe(1);
        expect(a.y).toBe(2);
        expect(b.x).toBe(3);
        expect(b.y).toBe(4);
    });

    test("sub returns new vector without mutating operands", () => {
        const a = new Vector2(5, 7);
        const b = new Vector2(2, 3);
        const c = a.sub(b);
        expect(c.x).toBe(3);
        expect(c.y).toBe(4);
        expect(a.x).toBe(5);
        expect(a.y).toBe(7);
    });

    test("scale returns new vector scaled by scalar", () => {
        const v = new Vector2(2, 3);
        const scaled = v.scale(2);
        expect(scaled.x).toBe(4);
        expect(scaled.y).toBe(6);
        expect(v.x).toBe(2);
        expect(v.y).toBe(3);
    });

    test("length computes magnitude", () => {
        const v = new Vector2(3, 4);
        expect(v.length).toBe(5);
    });

    test("length of zero vector is zero", () => {
        const v = new Vector2();
        expect(v.length).toBe(0);
    });

    test("normalize returns unit vector", () => {
        const v = new Vector2(3, 4);
        const n = v.normalize();
        expect(n.x).toBeCloseTo(0.6);
        expect(n.y).toBeCloseTo(0.8);
        expect(n.length).toBeCloseTo(1);
    });

    test("normalize of zero vector returns zero vector", () => {
        const v = new Vector2();
        const n = v.normalize();
        expect(n.x).toBe(0);
        expect(n.y).toBe(0);
    });

    test("rotate rotates vector by angle", () => {
        const v = new Vector2(1, 0);
        const rotated = v.rotate(Math.PI / 2);
        expect(rotated.x).toBeCloseTo(0);
        expect(rotated.y).toBeCloseTo(1);
    });

    test("rotate does not mutate original", () => {
        const v = new Vector2(1, 0);
        v.rotate(Math.PI / 2);
        expect(v.x).toBe(1);
        expect(v.y).toBe(0);
    });

    test("dot product computes correctly", () => {
        const a = new Vector2(1, 2);
        const b = new Vector2(3, 4);
        expect(a.dot(b)).toBe(11);
    });

    test("fromAngle returns unit vector at angle", () => {
        const v = Vector2.fromAngle(0);
        expect(v.x).toBeCloseTo(1);
        expect(v.y).toBeCloseTo(0);

        const v2 = Vector2.fromAngle(Math.PI / 2);
        expect(v2.x).toBeCloseTo(0);
        expect(v2.y).toBeCloseTo(1);
    });
});



