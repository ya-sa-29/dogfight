/**
 * Lobby model for room selection and player name entry.
 * Extends EventTarget to emit events for UI updates.
 */

export interface RoomInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly asteroidCount: number;
}

export interface LobbyEvents {
  "rooms-updated": CustomEvent<{ rooms: RoomInfo[] }>;
  error: CustomEvent<{ error: Error }>;
  join: CustomEvent<{ playerName: string; room: RoomInfo }>;
}

export class Lobby extends EventTarget {
  public readonly refreshInterval: number;
  public rooms: RoomInfo[] = [];
  public playerName = "";
  public selectedRoomId: string | null = null;

  private controller: AbortController | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor({ refreshInterval = 5000 } = {}) {
    super();
    this.refreshInterval = refreshInterval;
  }

  async loadRooms(signal?: AbortSignal): Promise<RoomInfo[]> {
    const response = await fetch("/api/rooms", {
      signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load rooms: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid rooms response");
    }

    this.rooms = data as RoomInfo[];

    if (!this.rooms.some((room) => room.id === this.selectedRoomId)) {
      this.selectedRoomId = this.rooms[0]?.id ?? null;
    }

    this.dispatchEvent(
      new CustomEvent("rooms-updated", {
        detail: { rooms: this.rooms },
      }),
    );

    return this.rooms;
  }

  async enter(): Promise<void> {
    this.leave();

    this.controller = new AbortController();

    try {
      await this.loadRooms(this.controller.signal);
      this.startRefreshing();
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        this.dispatchEvent(
          new CustomEvent("error", { detail: { error } }),
        );
      }
    }
  }

  startRefreshing(): void {
    this.refreshTimer = setInterval(async () => {
      if (!this.controller || this.controller.signal.aborted) return;

      try {
        await this.loadRooms(
          AbortSignal.any([
            this.controller.signal,
            AbortSignal.timeout(3000),
          ]),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name !== "AbortError" &&
          error.name !== "TimeoutError"
        ) {
          this.dispatchEvent(
            new CustomEvent("error", { detail: { error } }),
          );
        }
      }
    }, this.refreshInterval);
  }

  join(playerName: string, roomId: string): void {
    const name = playerName.trim();
    const room = this.rooms.find((item) => item.id === roomId);

    if (!name) throw new Error("Enter your player name");
    if (!room) throw new Error("Select a valid room");

    this.playerName = name;
    this.selectedRoomId = roomId;

    this.dispatchEvent(
      new CustomEvent("join", {
        detail: {
          playerName: name,
          room,
        },
      }),
    );
  }

  leave(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.controller?.abort();
    this.controller = null;
  }

  // Type-safe event listener helpers (wrappers around EventTarget methods)
  on<K extends keyof LobbyEvents>(
    type: K,
    listener: (event: LobbyEvents[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.addEventListener(type, listener as EventListener, options);
  }

  off<K extends keyof LobbyEvents>(
    type: K,
    listener: (event: LobbyEvents[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void {
    this.removeEventListener(type, listener as EventListener, options);
  }

  emit<K extends keyof LobbyEvents>(event: LobbyEvents[K]): boolean {
    return this.dispatchEvent(event);
  }
}