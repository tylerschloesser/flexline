import { MOVEMENT_KEYS } from "./config";

export class InputManager {
  private keys: Set<string> = new Set();
  private listeners: Set<(direction: { x: number; y: number }) => void> =
    new Set();
  private isActive = false;

  initialize(): void {
    if (this.isActive) return;

    this.isActive = true;
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("blur", this.handleBlur);
  }

  destroy(): void {
    if (!this.isActive) return;

    this.isActive = false;
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("blur", this.handleBlur);
    this.keys.clear();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (this.isMovementKey(key)) {
      event.preventDefault();
      this.keys.add(key);
      this.updateMovement();
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (this.isMovementKey(key)) {
      event.preventDefault();
      this.keys.delete(key);
      this.updateMovement();
    }
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.updateMovement();
  };

  private isMovementKey(key: string): boolean {
    return (Object.values(MOVEMENT_KEYS) as string[]).includes(key);
  }

  private updateMovement(): void {
    let x = 0;
    let y = 0;

    if (this.keys.has(MOVEMENT_KEYS.LEFT)) x -= 1;
    if (this.keys.has(MOVEMENT_KEYS.RIGHT)) x += 1;
    if (this.keys.has(MOVEMENT_KEYS.UP)) y -= 1;
    if (this.keys.has(MOVEMENT_KEYS.DOWN)) y += 1;

    // Normalize diagonal movement to maintain consistent speed
    if (x !== 0 && y !== 0) {
      const length = Math.sqrt(x * x + y * y);
      x /= length;
      y /= length;
    }

    this.notifyListeners({ x, y });
  }

  private notifyListeners(direction: { x: number; y: number }): void {
    this.listeners.forEach((listener) => listener(direction));
  }

  onMovement(
    callback: (direction: { x: number; y: number }) => void,
  ): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  isKeyPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }
}
