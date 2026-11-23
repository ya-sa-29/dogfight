export interface InputAPI {
  readonly isDown: (code: string) => boolean;
  readonly justPressed: (code: string) => boolean;
  readonly clearJustPressed: () => void;
}

/**
 * Creates an input handler that tracks key states.
 * @param target - EventTarget to listen for keyboard events (default: window)
 * @returns Input API with isDown, justPressed, and clearJustPressed methods
 */
export function createInput(target: EventTarget = window): InputAPI {
  const keys = new Set<string>();
  const pressedKeys = new Set<string>();

  const handleKeyDown = (event: Event): void => {
    const ke = event as KeyboardEvent;
    if (!keys.has(ke.code)) {
      pressedKeys.add(ke.code);
    }
    keys.add(ke.code);
  };

  const handleKeyUp = (event: Event): void => {
    const ke = event as KeyboardEvent;
    keys.delete(ke.code);
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);

  return {
    isDown(code: string): boolean {
      return keys.has(code);
    },

    justPressed(code: string): boolean {
      return pressedKeys.has(code);
    },

    clearJustPressed(): void {
      pressedKeys.clear();
    },
  };
}