export class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(other) {
        return new Vector2(this.x + other.x, this.y + other.y);
    }

    sub(other) {
        return new Vector2(this.x - other.x, this.y - other.y);
    }

    scale(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    get length() {
        return Math.hypot(this.x, this.y);
    }

    normalize() {
        const magnitude = this.length;

        if (magnitude === 0) {
            return new Vector2();
        }

        return this.scale(1 / magnitude);
    }

    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return new Vector2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos,
        );
    }

    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    static fromAngle(angle) {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }
}
