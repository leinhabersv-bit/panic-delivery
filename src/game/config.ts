export const GAME_CONFIG = {
  // World & Viewport (Expanded living city ~2x explorable area)
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  WORLD_WIDTH: 4600,
  WORLD_HEIGHT: 3600,

  // Match timing (Official Jam Rule: Exactly 120 seconds)
  ROUND_DURATION_SECONDS: 120,
  FINAL_RUSH_SECONDS: 15,

  // Van driving physics (Tuned for accessible, responsive arcade control)
  VAN: {
    WIDTH: 34,
    HEIGHT: 64,
    ACCELERATION: 440,       // px / s^2 (smooth, predictable pickup)
    BRAKE_FORCE: 900,        // px / s^2 (crisp, responsive stopping)
    REVERSE_ACCEL: 320,      // px / s^2 (fast recovery from dead ends)
    MAX_FORWARD_SPEED: 350,  // px / s (balanced speed for confident navigation)
    MAX_REVERSE_SPEED: 160,  // px / s
    STEER_SPEED: 4.2,        // rad / s (snappy, immediate steering)
    NATURAL_FRICTION: 0.965, // per 60fps tick base (settles cleanly off throttle)
    LATERAL_GRIP: 0.50,      // solid rail grip when NOT drifting
    DRIFT_LATERAL_GRIP: 0.88,// controlled, playful power slide when Z is held
    DRIFT_TURN_MULTIPLIER: 1.25, // tightens turn during drift without spinning out
    DRIFT_SPEED_RETENTION: 0.985,
    CRASH_SPEED_PENALTY: 0.20,   // gentle bounce to allow instant recovery
    CRASH_MIN_SPEED_TO_BREAK_COMBO: 180, // forgiving on minor scrapes
  },

  // Hold-to-Charge Package Throwing (Phase 3)
  PACKAGES: {
    MAX_CAPACITY: 5,
    RELOAD_TIME_SECONDS: 1.2,
    THROW_COOLDOWN_SECONDS: 0.35, // Rate limit / debounce between throws
    AUTO_REPLENISH_SECONDS: 2.0,  // Forgiving auto replenishment so player is never stranded
    CHARGE_DURATION_SECONDS: 0.8, // Maximum charge reached in 0.8s
    MAX_CHARGE_HOLD_SECONDS: 2.2, // Auto-release if held past this limit to prevent indefinite hold exploit
    MIN_THROW_SPEED: 380,         // Short tap throw distance (~210px)
    MAX_THROW_SPEED: 820,         // Full charge sniper distance (~450-500px)
    FLIGHT_TIME: 0.55,            // seconds in air
    HIT_RADIUS_TOLERANCE: 52,     // forgiving collision radius with target
    LONG_DISTANCE_THRESHOLD: 280, // distance threshold for sniper score
    LONG_DISTANCE_BONUS: 200,
    MOVING_DELIVERY_MIN_SPEED: 55,// Minimum van speed (px/s) for moving delivery bonus
    MOVING_DELIVERY_BONUS: 100,   // Bonus points for landing a moving delivery
    BASE_POINTS: 100,
  },

  // Delivery Types (Phase 4)
  DELIVERY_TYPES: {
    PIZZA: {
      name: 'PIZZA DELIVERY',
      color: '#ff5400',
      badgeColor: '#ff3366',
      icon: '🍕',
      bonusText: 'HOT & FRESH!',
      bonusPoints: 150,
    },
    EXPRESS: {
      name: 'EXPRESS PARCEL',
      color: '#00f5d4',
      badgeColor: '#3a86ff',
      icon: '📦',
      bonusText: 'SNIPER SHOT!',
      bonusPoints: 200,
    },
    FRAGILE: {
      name: 'FRAGILE GLASS',
      color: '#b5179e',
      badgeColor: '#7209b7',
      icon: '🏺',
      bonusText: 'PERFECT TOUCH!',
      bonusPoints: 250,
    },
  },

  // Targets & Zones (Phase 2 Rescue)
  TARGETS: {
    MAX_ACTIVE: 4,
    ZONE_RADIUS: 48,
    PULSE_SPEED: 3.5,
    FIRST_TARGET_MAX_DISTANCE: 450, // Pacing: first target reachable within 10-15s
    ROUTE_MIN_CHAIN_DISTANCE: 380,  // Sequential target pacing for combo chaining
    ROUTE_MAX_CHAIN_DISTANCE: 850,
  },

  // Celebration Contract (Keep the Party Moving)
  CELEBRATION: {
    DURATION_SECONDS: 1.5,
  },

  // Combos & Multipliers
  COMBO: {
    TIMER_SECONDS: 4.5,
    MAX_MULTIPLIER: 5,
  },

  // Living City & Ambient Life (Phase 2 & 5)
  CITY: {
    MAX_PEDESTRIANS: 26,
    MAX_TRAFFIC: 10,
    NEAR_MISS_DISTANCE: 65,
    NEAR_MISS_POINTS: 50,
    PEDESTRIAN_SPEED: 45,
    TRAFFIC_SPEED: 130,
  },

  // District & Environmental Visual Palette (Phase 1)
  COLORS: {
    GROUND_RESIDENTIAL: '#406343',
    GROUND_COMMERCIAL: '#333842',
    GROUND_PARK: '#2d6a4f',
    ROAD: '#262a34',
    ROAD_BORDER: '#181b22',
    ROAD_MARKING: '#ffc83b',
    ROAD_ZEBRA: '#f8fafc',
    SIDEWALK: '#e2e8f0',
    SIDEWALK_SHADOW: '#94a3b8',
    CURB: '#cbd5e1',
    BUILDING_SHADOW: 'rgba(15, 23, 42, 0.42)',
    ACCENT_CYAN: '#00f5d4',
    ACCENT_YELLOW: '#fee440',
    ACCENT_PINK: '#f72585',
    ACCENT_PURPLE: '#7209b7',
    ACCENT_GREEN: '#38b000',
    ACCENT_ORANGE: '#ff5400',
    VAN_BODY: '#fffae8',
    VAN_ROOF: '#ff3366',
    VAN_BUMPER: '#334155',
    VAN_GLASS: '#38bdf8',
    VAN_GLASS_SPEC: '#e0f2fe',
    PARCEL_BOX: '#d4a373',
    PARCEL_TAPE: '#faedcd',
    STREETLIGHT_GLOW: 'rgba(255, 230, 150, 0.22)',
  }
} as const;

export type GameConfig = typeof GAME_CONFIG;
