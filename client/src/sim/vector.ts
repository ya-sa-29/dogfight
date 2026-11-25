/**
 * 2D vector class for game simulation.
 * Immutable operations return new instances.
 */
export class Vector2 {
    readonly x: number;
    readonly y: number;

    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(other: Vector2): Vector2 {
        return new Vector2(this.x + other.x, this.y + other.y);
    }

    sub(other: Vector2): Vector2 {
        return new Vector2(this.x - other.x, this.y - other.y);
    }

    scale(scalar: number): Vector2 {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    get length(): number {
        return Math.hypot(this.x, this.y);
    }

    normalize(): Vector2 {
        const magnitude = this.length;

        if (magnitude === 0) {
            return new Vector2();
        }

        return this.scale(1 / magnitude);
    }

    rotate(angle: number): Vector2 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return new Vector2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos,
        );
    }

    dot(other: Vector2): number {
        return this.x * other.x + this.y * other.y;
    }

    static fromAngle(angle: number): Vector2 {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }
}