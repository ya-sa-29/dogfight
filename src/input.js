export function createInput(target = window) {
    const keys = new Set();
    const pressedKeys = new Set();

    target.addEventListener("keydown", (event) => {
        if (!keys.has(event.code)) {
            pressedKeys.add(event.code);
        }

        keys.add(event.code);
    });

    target.addEventListener("keyup", (event) => {
        keys.delete(event.code);
    });

    return {
        isDown(code) {
            return keys.has(code);
        },

        justPressed(code) {
            return pressedKeys.has(code);
        },

        clearJustPressed() {
            pressedKeys.clear();
        },
    };
}
