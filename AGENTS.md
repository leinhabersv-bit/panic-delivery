# Official Game-Jam Rules & AI Agent Instructions

## 1. Game Overview & Brief
- **Game Title**: PANIC DELIVERY
- **Genre**: Top-down arcade driving and package-delivery score attack
- **Platform / Stack**: Vite + TypeScript + HTML5 Canvas
- **Target Round Duration**: Exactly 120 seconds per match

## 2. Mandatory Controls & Input Specification
The game must support ONLY the following input bindings:
- **ArrowUp**: Accelerate / drive forward
- **ArrowDown**: Brake / reverse
- **ArrowLeft**: Steer left
- **ArrowRight**: Steer right
- **Z (KeyZ / 'z' / 'Z')**:
  - Menu / Title Screen: Start game (requires a fresh key press)
  - Gameplay: Controlled arcade drift when held while moving
  - Results / Game Over Screen: Restart game (requires a fresh key press)
- **Space ('Space')**:
  - Gameplay: Throw package (rate-limited / debounced action)
  - Menus: Must NOT trigger menu start or restart (reserved exclusively for in-game throwing action)

### Input Handling Discipline
- **Fresh Z Press (Edge Triggering)**: Starting, confirming, or restarting from menus must require a discrete key-down event (`consumed` on press), never triggering continuously from held state or auto-repeat.
- **Held-Key Behavior**: Smoothly maintain driving and drifting while keys are held.
- **Arrow-Release Movement**: When movement keys are released, the vehicle must decelerate naturally and come to a clean stop without unwanted sliding or sticky input momentum.
- **Space Action Frequency**: Throwing packages must enforce a deliberate fire rate / debounce to prevent accidental rapid-fire emptying of ammo in a single frame.
- **Accidental Input Prevention**: Prevent browser default scrolling for all game keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Space`, `KeyZ`).
- **Keyboard Focus Management**: Canvas / window must ensure focus capture and reset all held inputs on `blur`.

## 3. Gameplay & Usability Rules
- **120-Second Rounds**: Each match runs for a full 120-second countdown with urgent visual and audio cues during the final seconds.
- **Accessible Arcade Driving**:
  - Roads must be wide and comfortable (at least 6-7 vehicle widths).
  - Intersections and corners must allow clean 90-degree turns without wall scraping.
  - Immediate steering response with low-speed turning authority so the vehicle never gets stuck against obstacles.
  - Solid lateral grip during normal driving; Z drift is an optional high-skill technique, not a turning requirement.
- **Collision & Recovery**:
  - Wall collisions must push the vehicle cleanly out of obstacles without sticking, pinning, or vibrating.
  - Reversing must allow effortless steering out of corners.
- **Package Delivery & Scoring**:
  - Forgiving projectile arc collision with glowing delivery targets.
  - Automatic reload mechanism when cargo runs low.
  - Combo streak multiplier that increments on successful deliveries and resets on hard crashes or misses.
  - Bonus score for long-distance throws.

## 4. Visual Presentation & Demo Quality
- **Art Direction**: Bright, readable, cartoon arcade miniature city (Crossy Road and art of rally inspired readability).
- **Camera**: Smooth centered tracking, restrained lookahead, gentle speed zoom, and devicePixelRatio high-DPI retina rendering.
- **Juice & Feedback**: Dynamic tire smoke, skid marks, collision sparks, floating score popups, screen shake, and delivery celebrations.
- **HUD**: In-canvas temporary display featuring timer (120s), score, combo meter, cargo ammo, and off-screen radar arrows.

## 5. Development Constraints
- Work strictly on branch `feat/gameplay-core`.
- Maintain core code modularity under `src/game/`.
- Ensure `npm run build` passes with zero TypeScript errors.
- Never commit, push, or merge without explicit user approval.
