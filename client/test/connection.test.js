import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSocketUrl } from "../src/network/connection.js";

const WS = "ws:";
const WSS = "wss:";

describe("buildSocketUrl", () => {
    test("/ws with a page URL that has no query stays unchanged", () => {
        const url = buildSocketUrl("/ws", "http://localhost:5173/", WS);

        assert.equal(url.pathname, "/ws");
        assert.equal(url.search, "");
        assert.equal(url.href, "ws://localhost:5173/ws");
    });

    test("/ws forwards the page query (?latency=100)", () => {
        const url = buildSocketUrl(
            "/ws",
            "http://localhost:5173/?latency=100",
            WS,
        );

        assert.equal(url.pathname, "/ws");
        assert.equal(url.search, "?latency=100");
        assert.equal(url.href, "ws://localhost:5173/ws?latency=100");
        assert.equal(url.searchParams.get("latency"), "100");
    });

    test("forwards separate upstream/downstream parameters", () => {
        const url = buildSocketUrl(
            "/ws",
            "http://localhost:5173/?latency_up_base=100&latency_down_base=100&latency_up_jitter=20",
            WS,
        );

        assert.equal(url.searchParams.get("latency_up_base"), "100");
        assert.equal(url.searchParams.get("latency_down_base"), "100");
        assert.equal(url.searchParams.get("latency_up_jitter"), "20");
    });

    test("does not duplicate parameters when the endpoint already has its own query", () => {
        const url = buildSocketUrl(
            "/ws?latency=100",
            "http://localhost:5173/?latency=100&latency_up_base=100",
            WS,
        );

        // Endpoint query wins; page query is ignored, so no duplication.
        assert.equal(url.search, "?latency=100");
        assert.equal(url.searchParams.getAll("latency").length, 1);
        assert.equal(url.searchParams.get("latency"), "100");
        // The page-only parameter must not leak in.
        assert.equal(url.searchParams.get("latency_up_base"), null);
    });

    test("preserves an existing endpoint query untouched", () => {
        const url = buildSocketUrl(
            "/ws?latency_down_base=50",
            "http://localhost:5173/?latency=100",
            WS,
        );

        assert.equal(url.search, "?latency_down_base=50");
        assert.equal(url.searchParams.get("latency_down_base"), "50");
        assert.equal(url.searchParams.get("latency"), null);
    });

    test("switches protocol to wss: for https pages", () => {
        const url = buildSocketUrl(
            "/ws",
            "https://example.com/?latency=100",
            WSS,
        );

        assert.equal(url.protocol, "wss:");
        assert.equal(url.href, "wss://example.com/ws?latency=100");
    });

    test("switches protocol to ws: for http pages", () => {
        const url = buildSocketUrl(
            "/ws",
            "http://example.com/?latency=100",
            WS,
        );

        assert.equal(url.protocol, "ws:");
        assert.equal(url.href, "ws://example.com/ws?latency=100");
    });

    test("empty page query leaves the URL unchanged", () => {
        const url = buildSocketUrl("/ws", "http://localhost:5173/?", WS);

        assert.equal(url.search, "");
        assert.equal(url.href, "ws://localhost:5173/ws");
    });
});
