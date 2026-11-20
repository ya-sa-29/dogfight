export function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export class SeededRNG {
    constructor(seed = 1) {
        this.seed = seed >>> 0;
        this.next = mulberry32(this.seed);
    }

    random() {
        return this.next();
    }

    randomInt(min, max) {
        return Math.floor(this.random() * (max - min + 1)) + min;
    }

    randomFloat(min, max) {
        return this.random() * (max - min) + min;
    }

    randomSign() {
        return this.random() < 0.5 ? -1 : 1;
    }
}

export function createRNG(seed) {
    return new SeededRNG(seed);
}
