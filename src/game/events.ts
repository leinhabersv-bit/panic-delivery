import { ArcadeEvent, ArcadeEventType } from './types.ts';
import { SoundFx } from './audio.ts';
import { EffectsManager } from './effects.ts';

export class EventManager {
  public activeEvent: ArcadeEvent | null = null;
  private eventCooldown: number = 0;
  private scheduledEvents: { triggerTimeRemaining: number; type: ArcadeEventType; duration: number }[] = [
    { triggerTimeRemaining: 105, type: 'PIZZA_PANIC', duration: 25 },
    { triggerTimeRemaining: 75, type: 'NEIGHBORHOOD_FESTIVAL', duration: 25 },
    { triggerTimeRemaining: 45, type: 'TURBO_FEVER', duration: 20 },
    { triggerTimeRemaining: 15, type: 'GOLDEN_MINUTE', duration: 15 },
  ];
  private triggeredSet: Set<ArcadeEventType> = new Set();

  public reset(): void {
    this.activeEvent = null;
    this.eventCooldown = 0;
    this.triggeredSet.clear();
  }

  public update(
    dt: number,
    timeLeft: number,
    sound: SoundFx,
    effects: EffectsManager
  ): ArcadeEvent | null {
    // 1. Update active event
    if (this.activeEvent) {
      this.activeEvent.elapsed += dt;
      if (this.activeEvent.elapsed >= this.activeEvent.duration) {
        this.activeEvent = null;
        this.eventCooldown = 4.0; // Rest between events
      }
      return this.activeEvent;
    }

    if (this.eventCooldown > 0) {
      this.eventCooldown -= dt;
      return null;
    }

    // 2. Check scheduled events
    for (const item of this.scheduledEvents) {
      if (!this.triggeredSet.has(item.type) && timeLeft <= item.triggerTimeRemaining) {
        this.triggeredSet.add(item.type);
        this.activeEvent = this.createEvent(item.type, item.duration);
        sound.playEventStinger();
        effects.triggerFlash(this.activeEvent.color, 0.4);
        effects.addScorePopup(2300, 1800, `EVENT: ${this.activeEvent.title}`, this.activeEvent.color);
        break;
      }
    }

    return this.activeEvent;
  }

  private createEvent(type: ArcadeEventType, duration: number): ArcadeEvent {
    switch (type) {
      case 'PIZZA_PANIC':
        return {
          type,
          title: 'PIZZA PANIC!',
          description: 'ROCKET PIZZAS INCOMING! 2X PIZZA DELIVERIES!',
          duration,
          elapsed: 0,
          active: true,
          scoreMultiplier: 1.5,
          color: '#ff5400',
        };
      case 'NEIGHBORHOOD_FESTIVAL':
        return {
          type,
          title: 'NEIGHBORHOOD FESTIVAL!',
          description: 'THE ENTIRE CITY CELEBRATES! 1.5X SCORE BONUS!',
          duration,
          elapsed: 0,
          active: true,
          scoreMultiplier: 1.5,
          color: '#00f5d4',
        };
      case 'TURBO_FEVER':
        return {
          type,
          title: 'TURBO FEVER!',
          description: 'HYPER TURBO BOOST UNLOCKED! TOP SPEED!',
          duration,
          elapsed: 0,
          active: true,
          scoreMultiplier: 1.25,
          color: '#00bbf9',
        };
      case 'GOLDEN_MINUTE':
        return {
          type,
          title: 'GOLDEN MINUTE!',
          description: 'ROYAL GOLDEN PARCELS ACTIVE! 2X FINAL MULTIPLIER!',
          duration,
          elapsed: 0,
          active: true,
          scoreMultiplier: 2.0,
          color: '#ffd700',
        };
      default:
        return {
          type: 'PIZZA_PANIC',
          title: 'DELIVERY FRENZY!',
          description: 'SPEED BONUSES ACTIVE!',
          duration,
          elapsed: 0,
          active: true,
          scoreMultiplier: 1.5,
          color: '#fee440',
        };
    }
  }
}
