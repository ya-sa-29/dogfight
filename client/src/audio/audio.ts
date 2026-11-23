import { bus } from "../events/gameEvents.js";

export interface AudioSystem {
  readonly destroy: () => void;
}

/**
 * Creates the audio system that plays sounds in response to game events.
 * @param audioContext - Web Audio API context
 * @param buffers - Map of audio buffer names to AudioBuffer instances
 * @returns AudioSystem with destroy() method to clean up listeners
 */
export function createAudioSystem(
  audioContext: AudioContext,
  buffers: Record<string, AudioBuffer>,
): AudioSystem {
  function playSound(name: string, volume = 1): void {
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

const onFired = (detail: { readonly weapon: "bullet" | "missile" }): void => {
    playSound(detail.weapon === "missile" ? "missile" : "shot", 0.35);
};

const onHit = (): void => playSound("hit", 0.45);
const onExploded = (): void => playSound("explosion", 0.6);

const unsubscribeFired = bus.on("fired", onFired);
const unsubscribeHit = bus.on("hit", onHit);
const unsubscribeExploded = bus.on("exploded", onExploded);

return {
    destroy(): void {
        unsubscribeFired();
        unsubscribeHit();
        unsubscribeExploded();
    },
};
}