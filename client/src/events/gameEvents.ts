/**
 * Typed event bus for client game events.
 * Provides type-safe emit/on/off for a predefined event map.
 */

export interface GameEvents {
    fired: { readonly weapon: "bullet" | "missile" };
    hit: { readonly target: "asteroid" };
    exploded: { readonly target: "asteroid" | "ship" };
}

type EventCallback<T> = (detail: T) => void;

type EventMap = {
    [K in keyof GameEvents]: EventCallback<GameEvents[K]>;
};

/**
 * Generic typed event bus.
 * All event names and payloads are statically checked against TEvents.
 */
export class Bus<TEvents extends { [K in keyof TEvents]: object }> {
    #listeners = new Map<string, Set<EventCallback<object>>>();

    /**
     * Emit an event with a typed payload.
     * @param name - Event name (must be a key of TEvents)
     * @param detail - Payload matching TEvents[name]
     */
    emit<K extends keyof TEvents>(name: K, detail: TEvents[K]): void {
        const callbacks = this.#listeners.get(name as string);
        if (!callbacks) return;
        for (const cb of callbacks) {
            cb(detail as object);
        }
    }

    /**
     * Subscribe to an event.
     * @param name - Event name (must be a key of TEvents)
     * @param callback - Callback receiving TEvents[name]
     * @returns Unsubscribe function
     */
    on<K extends keyof TEvents>(name: K, callback: EventCallback<TEvents[K]>): () => void {
        const key = name as string;
        let set = this.#listeners.get(key);
        if (!set) {
            set = new Set();
            this.#listeners.set(key, set);
        }
        set.add(callback as EventCallback<object>);
        return () => this.off(name, callback);
    }

    /**
     * Unsubscribe from an event.
     * @param name - Event name
     * @param callback - Previously registered callback
     */
    off<K extends keyof TEvents>(name: K, callback: EventCallback<TEvents[K]>): void {
        const set = this.#listeners.get(name as string);
        if (!set) return;
        set.delete(callback as EventCallback<object>);
    }

    /**
     * Remove all listeners for an event.
     * @param name - Event name
     */
    offAll<K extends keyof TEvents>(name: K): void {
        this.#listeners.delete(name as string);
    }

    /**
     * Remove all listeners for all events.
     */
    clear(): void {
        this.#listeners.clear();
    }
}

/** Singleton typed event bus instance. */
export const bus = new Bus<GameEvents>();