export class InputHandler {
  public up: boolean = false;
  public down: boolean = false;
  public left: boolean = false;
  public right: boolean = false;
  public drift: boolean = false; // Z key (held for drifting)
  public space: boolean = false; // Space key (held/pressed)

  private zPressedThisFrame: boolean = false;
  private spacePressedThisFrame: boolean = false;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();
      const isZ = e.code === 'KeyZ' || keyLower === 'z';

      // Accidental input prevention: suppress default page scrolling for all 6 allowed controls
      if (
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'Space' ||
        isZ
      ) {
        e.preventDefault();
      }

      // Ignore OS auto-repeat for edge-triggered actions
      if (e.repeat) {
        return;
      }

      switch (e.code) {
        case 'ArrowUp':
          this.up = true;
          break;
        case 'ArrowDown':
          this.down = true;
          break;
        case 'ArrowLeft':
          this.left = true;
          break;
        case 'ArrowRight':
          this.right = true;
          break;
        case 'Space':
          this.spacePressedThisFrame = true;
          this.space = true;
          break;
      }

      if (isZ) {
        if (!this.drift) {
          this.zPressedThisFrame = true;
        }
        this.drift = true;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();
      const isZ = e.code === 'KeyZ' || keyLower === 'z';

      switch (e.code) {
        case 'ArrowUp':
          this.up = false;
          break;
        case 'ArrowDown':
          this.down = false;
          break;
        case 'ArrowLeft':
          this.left = false;
          break;
        case 'ArrowRight':
          this.right = false;
          break;
        case 'Space':
          this.space = false;
          break;
      }

      if (isZ) {
        this.drift = false;
      }
    });

    // Keyboard focus & blur management: reset all held inputs on window blur
    window.addEventListener('blur', () => {
      this.reset();
    });
  }

  // Edge-triggered fresh Z press for menu start/confirm/restart
  public consumeZ(): boolean {
    if (this.zPressedThisFrame) {
      this.zPressedThisFrame = false;
      return true;
    }
    return false;
  }

  // Edge-triggered Space press for throwing packages
  public consumeSpace(): boolean {
    if (this.spacePressedThisFrame) {
      this.spacePressedThisFrame = false;
      return true;
    }
    return false;
  }

  public reset(): void {
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.drift = false;
    this.space = false;
    this.zPressedThisFrame = false;
    this.spacePressedThisFrame = false;
  }
}
