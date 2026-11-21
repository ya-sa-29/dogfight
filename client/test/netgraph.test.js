import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createNetgraph } from "../src/netgraph/netgraph.js";

/**
 * A minimal recording 2D context. Netgraph only uses a small subset of the
 * canvas API, so this fake records the calls that matter for the overlay.
 */
function createFakeContext() {
    const calls = [];

    const record =
        (name) =>
        (...args) => {
            calls.push({ name, args });
        };

    return {
        calls,
        save: record("save"),
        restore: record("restore"),
        fillRect: record("fillRect"),
        strokeRect: record("strokeRect"),
        fillText: record("fillText"),
        measureText: (text) => ({ width: text.length * 7 }),
        set fillStyle(value) {
            calls.push({ name: "fillStyle", args: [value] });
        },
        set strokeStyle(value) {
            calls.push({ name: "strokeStyle", args: [value] });
        },
        set lineWidth(value) {
            calls.push({ name: "lineWidth", args: [value] });
        },
        set font(value) {
            calls.push({ name: "font", args: [value] });
        },
        set textAlign(value) {
            calls.push({ name: "textAlign", args: [value] });
        },
    };
}

function createHarness() {
    const context = createFakeContext();
    // Mirrors the real canvas wrapper from createCanvas(): the netgraph draws
    // in CSS viewport coordinates, so the mock exposes viewWidth/viewHeight.
    const canvas = {
        context,
        width: 1920,
        height: 1080,
        viewWidth: 1920,
        viewHeight: 1080,
    };

    const metrics = {
        rtt: 42,
        snapshotAge: 12,
        bytesInPerSec: 1024,
        bytesOutPerSec: 512,
        pendingInputs: 2,
        correction: 0,
    };

    const netgraph = createNetgraph(canvas, () => metrics);

    return { netgraph, context, canvas, metrics };
}

describe("Netgraph", () => {
    test("is disabled by default and renders nothing", () => {
        const { netgraph, context } = createHarness();

        assert.equal(netgraph.isEnabled(), false);

        netgraph.render();

        assert.equal(
            context.calls.length,
            0,
            "a disabled netgraph must not draw anything",
        );
    });

    test("toggle() flips the enabled state", () => {
        const { netgraph } = createHarness();

        netgraph.toggle();
        assert.equal(netgraph.isEnabled(), true);

        netgraph.toggle();
        assert.equal(netgraph.isEnabled(), false);
    });

    test("setEnabled() controls visibility explicitly", () => {
        const { netgraph } = createHarness();

        netgraph.setEnabled(true);
        assert.equal(netgraph.isEnabled(), true);

        netgraph.setEnabled(false);
        assert.equal(netgraph.isEnabled(), false);
    });

    test("renders the panel once enabled", () => {
        const { netgraph, context } = createHarness();

        netgraph.setEnabled(true);
        netgraph.render();

        const texts = context.calls
            .filter((call) => call.name === "fillText")
            .map((call) => call.args[0]);

        assert.ok(texts.includes("NETGRAPH"), "the title must be drawn");
        assert.ok(
            texts.some((text) => text.startsWith("RTT")),
            "the RTT row must be drawn",
        );
        assert.ok(
            texts.some((text) => text.startsWith("Pending Inputs")),
            "the pending inputs row must be drawn",
        );
    });

    test("renders metrics values", () => {
        const { netgraph, context, metrics } = createHarness();

        metrics.rtt = 42;
        metrics.bytesInPerSec = 1024;
        metrics.pendingInputs = 2;

        netgraph.setEnabled(true);
        netgraph.render();

        const texts = context.calls
            .filter((call) => call.name === "fillText")
            .map((call) => call.args[0]);

        assert.ok(
            texts.some((text) => text.includes("42.0 ms")),
            "the RTT value must be rendered",
        );
        assert.ok(
            texts.some((text) => text.includes("1024 B/s")),
            "the bytes/s value must be rendered",
        );
    });

    test("renders without any snapshot data", () => {
        const { netgraph, context, metrics } = createHarness();

        // No snapshot has arrived yet: rtt may be null and age unknown.
        metrics.rtt = null;
        metrics.snapshotAge = null;
        metrics.pendingInputs = 0;

        netgraph.setEnabled(true);

        assert.doesNotThrow(() => netgraph.render());

        const texts = context.calls
            .filter((call) => call.name === "fillText")
            .map((call) => call.args[0]);

        assert.ok(
            texts.some((text) => text.includes("—")),
            "missing metrics must render an em dash placeholder",
        );
    });

    test("positions the panel inside the canvas", () => {
        const { netgraph, context, canvas } = createHarness();

        netgraph.setEnabled(true);
        netgraph.render();

        const fillRect = context.calls.find((call) => call.name === "fillRect");

        assert.ok(fillRect, "the panel background must be drawn");

        const [x, y, width, height] = fillRect.args;

        assert.ok(x >= 0, "x must be on-screen");
        assert.ok(y >= 0, "y must be on-screen");
        assert.ok(x + width <= canvas.width, "the panel must fit horizontally");
        assert.ok(y + height <= canvas.height, "the panel must fit vertically");
    });

    test("draws a panel background and border", () => {
        const { netgraph, context } = createHarness();

        netgraph.setEnabled(true);
        netgraph.render();

        const names = context.calls.map((call) => call.name);

        assert.ok(names.includes("fillRect"), "background must be filled");
        assert.ok(names.includes("strokeRect"), "border must be stroked");
    });

    test("restores context state after rendering", () => {
        const { netgraph, context } = createHarness();

        netgraph.setEnabled(true);
        netgraph.render();

        const saves = context.calls.filter(
            (call) => call.name === "save",
        ).length;
        const restores = context.calls.filter(
            (call) => call.name === "restore",
        ).length;

        assert.equal(saves, restores, "render must not leak canvas state");
    });
});
