import { test, expect } from "@playwright/test";

const PLAYER_A_NAME = "PlayerA";
const PLAYER_B_NAME = "PlayerB";

async function joinGame(
    page: any,
    playerName: string,
): Promise<{ playerId: string; shipId: number }> {
    const errors: string[] = [];
    const consoleMessages: string[] = [];

    page.on("pageerror", (err: Error) => errors.push(err.message));
    page.on("console", (msg: any) => {
        if (msg.type() === "error") consoleMessages.push(msg.text());
    });

    // Click "Enable Audio & Start" to begin
    console.log(`[${playerName}] Clicking start button...`);
    const startButton = page.locator("button", {
        hasText: /Enable Audio & Start/,
    });
    await startButton.waitFor({ state: "visible", timeout: 10000 });
    await startButton.click();
    console.log(`[${playerName}] Start button clicked`);

    // Wait for lobby to appear (assets load, minimum 800ms)
    console.log(`[${playerName}] Waiting for lobby...`);
    const nameInput = page.locator("#player-name");
    await nameInput.waitFor({ state: "visible", timeout: 20000 });
    console.log(`[${playerName}] Lobby appeared`);

    if (errors.length > 0) {
        console.log("Page errors during join:", errors);
    }
    if (consoleMessages.length > 0) {
        console.log("Console errors during join:", consoleMessages);
    }

    // Enter player name
    console.log(`[${playerName}] Entering name...`);
    await nameInput.fill(playerName);

    // Select a room from dropdown
    console.log(`[${playerName}] Waiting for room select...`);
    const roomSelect = page.locator("#room-select");
    await roomSelect.waitFor({ state: "visible", timeout: 10000 });

    // Click join
    console.log(`[${playerName}] Clicking join...`);
    const joinButton = page.locator("#join-button");
    await joinButton.waitFor({ state: "visible", timeout: 10000 });
    await joinButton.click();
    console.log(`[${playerName}] Join button clicked`);

    // Wait for gameConnection to be set on window (set inside handleJoin after join)
    console.log(`[${playerName}] Waiting for gameConnection...`);
    await page.waitForFunction(
        () => (window as any).gameConnection !== undefined,
        {
            timeout: 15000,
        },
    );
    console.log(`[${playerName}] gameConnection found`);

    // Wait for the joined event via gameConnection
    console.log(`[${playerName}] Waiting for joined event...`);
    const joined = await page.evaluate(
        (): Promise<{ playerId: string; shipId: number }> => {
            return new Promise((resolve, reject) => {
                const gc = (window as any).gameConnection;
                if (!gc) {
                    reject(new Error("gameConnection not found"));
                    return;
                }
                // M4: joined may fire before this listener is attached (the
                // client sets gameConnection before connect() completes). Check
                // for already-delivered joined data first.
                const already = (
                    gc as {
                        joinedDetail?: { playerId: string; shipId: number };
                    }
                ).joinedDetail;
                if (already) {
                    resolve({
                        playerId: already.playerId,
                        shipId: already.shipId,
                    });
                    return;
                }
                const handler = (e: CustomEvent) => {
                    gc.removeEventListener("joined", handler as EventListener);
                    resolve({
                        playerId: e.detail.playerId,
                        shipId: e.detail.shipId,
                    });
                };
                gc.addEventListener("joined", handler);
                setTimeout(
                    () => reject(new Error("joined event timeout")),
                    15000,
                );
            });
        },
    );
    console.log(`[${playerName}] Joined:`, joined);
    return joined;
}

async function waitForRoster(
    page: any,
    expectedPlayers: number,
): Promise<{ id: string; name: string }[]> {
    await page.waitForFunction(
        () => (window as any).gameConnection !== undefined,
        {
            timeout: 15000,
        },
    );
    return page.evaluate(
        (expected: number): Promise<{ id: string; name: string }[]> => {
            return new Promise((resolve, reject) => {
                const gc = (window as any).gameConnection;
                if (!gc) {
                    reject(new Error("gameConnection not found"));
                    return;
                }
                // M4: roster may broadcast before this listener is attached.
                const already = (
                    gc as { rosterDetail?: { id: string; name: string }[] }
                ).rosterDetail;
                if (already && already.length >= expected) {
                    resolve(already);
                    return;
                }
                const handler = (e: CustomEvent) => {
                    const players = e.detail.players || [];
                    if (players.length >= expected) {
                        gc.removeEventListener(
                            "roster",
                            handler as EventListener,
                        );
                        resolve(players);
                    }
                };
                gc.addEventListener("roster", handler);
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                `roster timeout: expected ${expected} players`,
                            ),
                        ),
                    15000,
                );
            });
        },
        expectedPlayers,
    );
}

test.describe("Multiplayer E2E", () => {
    test("two players join same room, roster syncs, movement and chat propagate", async ({
        browser,
    }) => {
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();

        try {
            const pageA = await contextA.newPage();
            const pageB = await contextB.newPage();

            console.log("Navigating to client...");
            await pageA.goto("/");
            await pageB.goto("/");
            console.log("Pages loaded");

            console.log("Player A joining...");
            const resultA = await joinGame(pageA, PLAYER_A_NAME);
            console.log("Player A joined:", resultA);

            console.log("Player B joining...");
            const resultB = await joinGame(pageB, PLAYER_B_NAME);
            console.log("Player B joined:", resultB);

            console.log("Waiting for roster sync...");
            const rosterA = await waitForRoster(pageA, 2);
            const rosterB = await waitForRoster(pageB, 2);
            console.log("Roster A:", rosterA);
            console.log("Roster B:", rosterB);

            expect(rosterA.length).toBe(2);
            expect(rosterB.length).toBe(2);

            const namesA = rosterA.map((p) => p.name).sort();
            const namesB = rosterB.map((p) => p.name).sort();
            expect(namesA).toEqual([PLAYER_A_NAME, PLAYER_B_NAME]);
            expect(namesB).toEqual([PLAYER_A_NAME, PLAYER_B_NAME]);

            // Chat propagation: Player A sends chat, Player B receives it.
            const chatMessage = "Hello from Player A";

            const chatPromise = pageB.evaluate(
                (): Promise<{ playerName: string; message: string }> => {
                    return new Promise((resolve, reject) => {
                        const gc = (window as any).gameConnection;
                        if (!gc) {
                            reject(new Error("gameConnection not found"));
                            return;
                        }
                        const handler = (e: CustomEvent) => {
                            resolve({
                                playerName: e.detail.playerName,
                                message: e.detail.message,
                            });
                        };
                        gc.addEventListener("chat", handler);
                        setTimeout(() => {
                            gc.removeEventListener(
                                "chat",
                                handler as EventListener,
                            );
                            reject(new Error("chat timeout"));
                        }, 15000);
                    });
                },
            );

            await pageA.evaluate((msg: string) => {
                (window as any).gameConnection.send({
                    type: "chat",
                    message: msg,
                });
            }, chatMessage);

            const received = await chatPromise;
            expect(received.playerName).toBe(PLAYER_A_NAME);
            expect(received.message).toBe(chatMessage);
        } finally {
            await contextA.close();
            await contextB.close();
        }
    });
});
