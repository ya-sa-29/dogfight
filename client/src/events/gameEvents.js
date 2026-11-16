
class GameEvents extends EventTarget {
    emit(name, detail = {}) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }
}

export const gameEvents = new GameEvents();
