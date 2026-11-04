
import { gameEvents } from "../events/gameEvents.js";

export function createAudioSystem(audioContext, buffers) {
    function playSound(name, volume = 1) {
        const buffer = buffers[name];

        if (!buffer || audioContext.state !== "running") {
            return;
        }

        const source = audioContext.createBufferSource();
        const gain = audioContext.createGain();

        source.buffer = buffer;
        gain.gain.value = volume;

        source.connect(gain);
        gain.connect(audioContext.destination);

        source.start();
    }

    const onFired = (event) => {
        const weapon = event.detail.weapon;

        playSound(weapon === "missile" ? "missile" : "shot", 0.35);
    };

    const onHit = () => playSound("hit", 0.45);
    const onExploded = () => playSound("explosion", 0.6);

    gameEvents.addEventListener("fired", onFired);
    gameEvents.addEventListener("hit", onHit);
    gameEvents.addEventListener("exploded", onExploded);

    return {
        destroy() {
            gameEvents.removeEventListener("fired", onFired);
            gameEvents.removeEventListener("hit", onHit);
            gameEvents.removeEventListener("exploded", onExploded);
        },
    };
}
