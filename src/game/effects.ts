import type { SkidSegment } from './types.ts';

export interface JuiceParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  drag: number;
  shape: 'circle' | 'square' | 'star' | 'ring';
  rotation: number;
  vRot: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  scale: number;
  vy: number;
}

export interface SpeedStreak {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
}

export class EffectsManager {
  public particles: JuiceParticle[] = [];
  public skidMarks: SkidSegment[] = [];
  public floatingTexts: FloatingText[] = [];
  public speedStreaks: SpeedStreak[] = [];

  // Screen shake
  public shakeTrauma: number = 0;
  public shakeOffsetX: number = 0;
  public shakeOffsetY: number = 0;

  // Flash feedback
  public flashAlpha: number = 0;
  public flashColor: string = '#ffffff';

  private maxSkids: number = 320;

  public addScreenShake(amount: number): void {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + amount);
  }

  public triggerFlash(color: string = '#ffffff', alpha: number = 0.35): void {
    this.flashColor = color;
    this.flashAlpha = alpha;
  }

  public addSkidMark(x1: number, y1: number, x2: number, y2: number, alpha: number = 0.5): void {
    this.skidMarks.push({
      x1,
      y1,
      x2,
      y2,
      alpha,
      width: 5,
    });
    if (this.skidMarks.length > this.maxSkids) {
      this.skidMarks.shift();
    }
  }

  public addTireSmoke(x: number, y: number, color: string = 'rgba(240, 245, 255, 0.7)'): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = 12 + Math.random() * 28;
    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6, // Rises slightly
      radius: 6 + Math.random() * 8,
      color,
      alpha: 0.75,
      life: 0,
      maxLife: 0.45 + Math.random() * 0.3,
      drag: 0.92,
      shape: 'circle',
      rotation: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 3,
    });
  }

  public addPackageTrail(x: number, y: number): void {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18,
      radius: 3 + Math.random() * 3,
      color: Math.random() > 0.5 ? '#ffd166' : '#ffffff',
      alpha: 0.9,
      life: 0,
      maxLife: 0.28,
      drag: 0.88,
      shape: 'star',
      rotation: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 8,
    });
  }

  public addDeliveryBurst(x: number, y: number, color: string = '#00f5d4'): void {
    this.addScreenShake(0.3);
    this.triggerFlash(color, 0.25);

    // Expanding shockwave ring
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 14,
      color,
      alpha: 1.0,
      life: 0,
      maxLife: 0.5,
      drag: 1.0,
      shape: 'ring',
      rotation: 0,
      vRot: 0,
    });

    // 3D spinning confetti & star burst
    const count = 40;
    const colors = [color, '#fee440', '#f72585', '#ffffff', '#00f5d4', '#7209b7'];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 90 + Math.random() * 260;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4 + Math.random() * 5,
        color: colors[i % colors.length],
        alpha: 1.0,
        life: 0,
        maxLife: 0.7 + Math.random() * 0.5,
        drag: 0.93,
        shape: Math.random() > 0.4 ? 'star' : 'square',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 12,
      });
    }
  }

  public addMissDust(x: number, y: number): void {
    this.addScreenShake(0.15);
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 5 + Math.random() * 6,
        color: '#c97a4e',
        alpha: 0.8,
        life: 0,
        maxLife: 0.45,
        drag: 0.9,
        shape: 'circle',
        rotation: 0,
        vRot: 0,
      });
    }
  }

  public addCrashSparks(x: number, y: number): void {
    this.addScreenShake(0.55);
    this.triggerFlash('#ff0055', 0.3);

    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 110 + Math.random() * 280;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 3,
        color: Math.random() > 0.3 ? '#fee440' : '#ff0055',
        alpha: 1.0,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        drag: 0.88,
        shape: 'square',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 14,
      });
    }
  }

  public addScorePopup(x: number, y: number, text: string, color: string = '#fee440'): void {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      alpha: 1.0,
      life: 0,
      maxLife: 1.0,
      scale: 0.3, // Starts with punchy bounce pop
      vy: -75,
    });
  }

  public updateSpeedStreaks(carSpeed: number, viewW: number, viewH: number): void {
    const isHighSpeed = carSpeed > 320;
    if (isHighSpeed && Math.random() < 0.4) {
      this.speedStreaks.push({
        x: Math.random() * viewW,
        y: Math.random() * viewH,
        length: 25 + Math.random() * 45,
        speed: 600 + Math.random() * 400,
        alpha: 0.45,
      });
    }

    for (let i = this.speedStreaks.length - 1; i >= 0; i--) {
      const st = this.speedStreaks[i];
      st.alpha -= 0.05;
      if (st.alpha <= 0) {
        this.speedStreaks.splice(i, 1);
      }
    }
  }

  public update(dt: number): void {
    // Flash fade
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3.5);
    }

    // Screen shake update
    if (this.shakeTrauma > 0) {
      const shakePower = Math.pow(this.shakeTrauma, 2) * 18;
      this.shakeOffsetX = (Math.random() * 2 - 1) * shakePower;
      this.shakeOffsetY = (Math.random() * 2 - 1) * shakePower;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.8);
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    // Skid marks fade slowly
    for (let i = this.skidMarks.length - 1; i >= 0; i--) {
      const sm = this.skidMarks[i];
      sm.alpha -= dt * 0.025;
      if (sm.alpha <= 0) {
        this.skidMarks.splice(i, 1);
      }
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.rotation += p.vRot * dt;

      const progress = p.life / p.maxLife;
      p.alpha = 1 - progress;

      if (p.shape === 'ring') {
        p.radius += dt * 220;
      } else {
        p.radius *= 1 + dt * 0.7;
      }
    }

    // Floating text popups update (Bounce scale-in physics)
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
      ft.vy *= 0.96; // Ease deceleration

      // Scale bounce: 0.3 -> 1.4 -> 1.0
      if (ft.life < 0.15) {
        ft.scale = 0.3 + (ft.life / 0.15) * 1.1;
      } else if (ft.life < 0.28) {
        ft.scale = 1.4 - ((ft.life - 0.15) / 0.13) * 0.4;
      } else {
        ft.scale = 1.0;
      }

      const progress = ft.life / ft.maxLife;
      ft.alpha = 1 - Math.pow(progress, 3);
    }
  }

  public renderSkids(ctx: CanvasRenderingContext2D): void {
    if (this.skidMarks.length === 0) return;
    ctx.lineCap = 'round';
    for (const sm of this.skidMarks) {
      ctx.strokeStyle = `rgba(15, 20, 28, ${sm.alpha})`;
      ctx.lineWidth = sm.width;
      ctx.beginPath();
      ctx.moveTo(sm.x1, sm.y1);
      ctx.lineTo(sm.x2, sm.y2);
      ctx.stroke();
    }
  }

  public renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.shape === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1, p.radius), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === 'star') {
        // Draw 5-pointed cute star
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const spikes = 5;
        const outer = p.radius;
        const inner = p.radius * 0.5;
        for (let s = 0; s < spikes * 2; s++) {
          const r = s % 2 === 0 ? outer : inner;
          const a = (s * Math.PI) / spikes;
          const sx = Math.cos(a) * r;
          const sy = Math.sin(a) * r;
          if (s === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
      } else {
        // Volumetric round smoke puff
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1, p.radius), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  public renderFloatingTexts(ctx: CanvasRenderingContext2D): void {
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.translate(ft.x, ft.y);
      ctx.scale(ft.scale, ft.scale);

      ctx.font = '900 22px "Fredoka", "Impact", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Drop shadow for cartoon punch
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillText(ft.text, 2, 3);

      // Deep dark outline
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 6;
      ctx.strokeText(ft.text, 0, 0);

      // Inner fill
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);

      ctx.restore();
    }
  }

  public renderSpeedStreaks(ctx: CanvasRenderingContext2D): void {
    if (this.speedStreaks.length === 0) return;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (const st of this.speedStreaks) {
      ctx.globalAlpha = st.alpha;
      ctx.beginPath();
      ctx.moveTo(st.x, st.y);
      ctx.lineTo(st.x - st.length, st.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  public renderFlash(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.flashAlpha;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  public clear(): void {
    this.particles = [];
    this.skidMarks = [];
    this.floatingTexts = [];
    this.speedStreaks = [];
    this.shakeTrauma = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.flashAlpha = 0;
  }
}
