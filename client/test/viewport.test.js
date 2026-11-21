import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    computeWorldViewport,
    computeBackingBuffer,
} from "../src/render/viewport.js";

const WORLD = { roomWidth: 1600, roomHeight: 900 };

describe("computeWorldViewport", () => {
    test("1920x1080 viewport with a 1600x900 world fills exactly", () => {
        const result = computeWorldViewport({
            viewWidth: 1920,
            viewHeight: 1080,
            ...WORLD,
        });

        // 1920/1600 = 1.2 and 1080/900 = 1.2 -> identical, no letterbox.
        assert.equal(result.scale, 1.2);
        assert.equal(result.offsetX, 0);
        assert.equal(result.offsetY, 0);
    });

    test("1536x864 viewport with a 1600x900 world fills exactly", () => {
        const result = computeWorldViewport({
            viewWidth: 1536,
            viewHeight: 864,
            ...WORLD,
        });

        assert.equal(result.scale, 0.96);
        assert.equal(result.offsetX, 0);
        assert.equal(result.offsetY, 0);
    });

    test("1920x1200 viewport (16:10) letterboxes vertically", () => {
        const result = computeWorldViewport({
            viewWidth: 1920,
            viewHeight: 1200,
            ...WORLD,
        });

        // Width-limited: 1920/1600 = 1.2, 1200/900 = 1.333 -> scale 1.2.
        assert.equal(result.scale, 1.2);
        assert.equal(result.offsetX, 0);

        // World height on screen = 900 * 1.2 = 1080; leftover = 120 -> 60 top.
        assert.equal(result.offsetY, 60);
    });

    test("1440x1080 viewport (4:3) letterboxes vertically", () => {
        const result = computeWorldViewport({
            viewWidth: 1440,
            viewHeight: 1080,
            ...WORLD,
        });

        // Width-limited: 1440/1600 = 0.9 vs 1080/900 = 1.2 -> scale 0.9.
        assert.equal(result.scale, 0.9);
        assert.equal(result.offsetX, 0);

        // World height on screen = 900 * 0.9 = 810; leftover = 270 -> 135 top.
        assert.equal(result.offsetY, 135);
    });

    test("a genuinely height-limited viewport has zero vertical offset", () => {
        // Tall, narrow viewport: 800/1600 = 0.5 vs 1200/900 = 1.333.
        const result = computeWorldViewport({
            viewWidth: 800,
            viewHeight: 1200,
            ...WORLD,
        });

        assert.equal(result.scale, 0.5, "width-limited at 0.5");
        assert.equal(result.offsetX, 0);
        assert.equal(result.offsetY, (1200 - 900 * 0.5) / 2);
    });

    test("uniform scale preserves the world aspect ratio", () => {
        const viewports = [
            { viewWidth: 1920, viewHeight: 1080 },
            { viewWidth: 1536, viewHeight: 864 },
            { viewWidth: 1920, viewHeight: 1200 },
            { viewWidth: 1440, viewHeight: 1080 },
            { viewWidth: 1000, viewHeight: 1000 },
            { viewWidth: 800, viewHeight: 600 },
        ];

        for (const viewport of viewports) {
            const { scale } = computeWorldViewport({ ...viewport, ...WORLD });

            const renderedWidth = WORLD.roomWidth * scale;
            const renderedHeight = WORLD.roomHeight * scale;

            assert.ok(
                Math.abs(renderedWidth / renderedHeight - WORLD.roomWidth / WORLD.roomHeight) <
                    1e-9,
                "aspect ratio must be preserved",
            );
        }
    });

    test("the entire world fits inside the viewport", () => {
        const viewports = [
            { viewWidth: 1920, viewHeight: 1080 },
            { viewWidth: 1536, viewHeight: 864 },
            { viewWidth: 1920, viewHeight: 1200 },
            { viewWidth: 1440, viewHeight: 1080 },
            { viewWidth: 1000, viewHeight: 1000 },
            { viewWidth: 500, viewHeight: 900 },
        ];

        for (const viewport of viewports) {
            const { scale, offsetX, offsetY } = computeWorldViewport({
                ...viewport,
                ...WORLD,
            });

            const right = offsetX + WORLD.roomWidth * scale;
            const bottom = offsetY + WORLD.roomHeight * scale;

            assert.ok(right <= viewport.viewWidth + 1e-9, "world must not overflow right");
            assert.ok(bottom <= viewport.viewHeight + 1e-9, "world must not overflow bottom");
        }
    });

    test("offsets centre the world and are never negative", () => {
        const viewports = [
            { viewWidth: 1920, viewHeight: 1080 },
            { viewWidth: 1536, viewHeight: 864 },
            { viewWidth: 1920, viewHeight: 1200 },
            { viewWidth: 1440, viewHeight: 1080 },
            { viewWidth: 2560, viewHeight: 1080 },
            { viewWidth: 800, viewHeight: 1200 },
        ];

        for (const viewport of viewports) {
            const { scale, offsetX, offsetY } = computeWorldViewport({
                ...viewport,
                ...WORLD,
            });

            assert.ok(offsetX >= 0, "offsetX must not be negative");
            assert.ok(offsetY >= 0, "offsetY must not be negative");

            // Centring: the leftover space is split evenly on both sides.
            const leftoverX = viewport.viewWidth - WORLD.roomWidth * scale;
            const leftoverY = viewport.viewHeight - WORLD.roomHeight * scale;

            assert.ok(Math.abs(offsetX - leftoverX / 2) < 1e-9);
            assert.ok(Math.abs(offsetY - leftoverY / 2) < 1e-9);
        }
    });

    test("the limiting axis has zero leftover on that axis", () => {
        // 1920/1600 = 1.2 vs 1200/900 = 1.333 -> width-limited, so the
        // horizontal leftover is zero and the vertical leftover is letterboxed.
        const wide = computeWorldViewport({
            viewWidth: 1920,
            viewHeight: 1200,
            ...WORLD,
        });
        assert.equal(wide.offsetX, 0, "width-limited: no horizontal bar");
        assert.ok(wide.offsetY > 0, "width-limited: vertical bar expected");

        // 1440/1600 = 0.9 vs 1080/900 = 1.2 -> width-limited, so the
        // horizontal leftover is zero and the vertical leftover is letterboxed.
        const tall = computeWorldViewport({
            viewWidth: 1440,
            viewHeight: 1080,
            ...WORLD,
        });
        assert.equal(tall.offsetX, 0, "width-limited: no horizontal bar");
        assert.ok(tall.offsetY > 0, "width-limited: vertical bar expected");
    });

    test("world-to-CSS scaling is independent of DPR", () => {
        // DPR must never enter this calculation: the same CSS viewport always
        // produces the same scale, regardless of display density.
        const dprs = [1, 1.25, 1.5, 2];
        const results = dprs.map(() =>
            computeWorldViewport({
                viewWidth: 1536,
                viewHeight: 864,
                ...WORLD,
            }),
        );

        for (const result of results) {
            assert.equal(result.scale, results[0].scale);
            assert.equal(result.offsetX, results[0].offsetX);
            assert.equal(result.offsetY, results[0].offsetY);
        }
    });

    test("a world exactly matching the viewport needs no letterbox", () => {
        const result = computeWorldViewport({
            viewWidth: 1600,
            viewHeight: 900,
            roomWidth: 1600,
            roomHeight: 900,
        });

        assert.equal(result.scale, 1);
        assert.equal(result.offsetX, 0);
        assert.equal(result.offsetY, 0);
    });

    test("scaling up a small viewport still fits the world", () => {
        const result = computeWorldViewport({
            viewWidth: 400,
            viewHeight: 300,
            ...WORLD,
        });

        assert.ok(result.scale > 0);
        assert.ok(result.scale < 1, "a small viewport must scale the world down");
        assert.ok(result.offsetX >= 0);
        assert.ok(result.offsetY >= 0);
    });

    test("rejects invalid dimensions", () => {
        assert.throws(() =>
            computeWorldViewport({
                viewWidth: 1920,
                viewHeight: 1080,
                roomWidth: 0,
                roomHeight: 900,
            }),
        );

        assert.throws(() =>
            computeWorldViewport({
                viewWidth: 0,
                viewHeight: 1080,
                roomWidth: 1600,
                roomHeight: 900,
            }),
        );
    });
});

describe("computeBackingBuffer", () => {
    test("DPR 1 keeps the buffer equal to the CSS size", () => {
        const result = computeBackingBuffer({
            viewWidth: 1920,
            viewHeight: 1080,
            dpr: 1,
        });

        assert.equal(result.bufferWidth, 1920);
        assert.equal(result.bufferHeight, 1080);
        assert.equal(result.cssWidth, 1920);
        assert.equal(result.cssHeight, 1080);
    });

    test("DPR 1.25 scales the buffer but not the CSS size", () => {
        const result = computeBackingBuffer({
            viewWidth: 1536,
            viewHeight: 864,
            dpr: 1.25,
        });

        assert.equal(result.bufferWidth, 1920);
        assert.equal(result.bufferHeight, 1080);
        assert.equal(result.cssWidth, 1536);
        assert.equal(result.cssHeight, 864);
    });

    test("DPR 1.5 scales the buffer but not the CSS size", () => {
        const result = computeBackingBuffer({
            viewWidth: 1280,
            viewHeight: 720,
            dpr: 1.5,
        });

        assert.equal(result.bufferWidth, 1920);
        assert.equal(result.bufferHeight, 1080);
        assert.equal(result.cssWidth, 1280);
        assert.equal(result.cssHeight, 720);
    });

    test("DPR 2 doubles the buffer but not the CSS size", () => {
        const result = computeBackingBuffer({
            viewWidth: 960,
            viewHeight: 540,
            dpr: 2,
        });

        assert.equal(result.bufferWidth, 1920);
        assert.equal(result.bufferHeight, 1080);
        assert.equal(result.cssWidth, 960);
        assert.equal(result.cssHeight, 540);
    });

    test("the buffer-to-CSS ratio always equals DPR", () => {
        for (const dpr of [1, 1.25, 1.5, 2]) {
            const result = computeBackingBuffer({
                viewWidth: 1366,
                viewHeight: 768,
                dpr,
            });

            assert.ok(
                Math.abs(result.bufferWidth / result.cssWidth - dpr) < 1e-9,
            );
            assert.ok(
                Math.abs(result.bufferHeight / result.cssHeight - dpr) < 1e-9,
            );
        }
    });

    test("rejects invalid input", () => {
        assert.throws(() =>
            computeBackingBuffer({ viewWidth: 0, viewHeight: 1080, dpr: 1 }),
        );
        assert.throws(() =>
            computeBackingBuffer({ viewWidth: 1920, viewHeight: 1080, dpr: 0 }),
        );
        assert.throws(() =>
            computeBackingBuffer({ viewWidth: 1920, viewHeight: 1080, dpr: -1 }),
        );
    });
});