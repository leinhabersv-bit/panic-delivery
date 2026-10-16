import { GAME_CONFIG } from './config.ts';
import { GameState, DeliveryTarget } from './types.ts';

export class TemporaryHUD {
  public render(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    carX: number,
    carY: number,
    targets: DeliveryTarget[],
    cameraX: number,
    cameraY: number
  ): void {
    ctx.save();

    if (state.phase === 'MENU') {
      this.renderMenu(ctx);
    } else if (state.phase === 'PLAYING') {
      this.renderPlaying(ctx, state);
      this.renderTargetPointers(ctx, carX, carY, targets, cameraX, cameraY);
    } else if (state.phase === 'GAMEOVER') {
      this.renderGameOver(ctx, state);
    }

    ctx.restore();
  }

  private renderPlaying(ctx: CanvasRenderingContext2D, state: GameState): void {
    const W = GAME_CONFIG.CANVAS_WIDTH;

    // --- TOP STATUS BAR (Glassmorphism Pill) ---
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(24, 16, W - 48, 68, 16);
    ctx.fill();
    ctx.stroke();

    // 1. TIMER
    const timerX = 54;
    const isUrgent = state.timeLeft <= 10;
    ctx.font = 'bold 11px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = isUrgent ? '#ff3366' : '#94a3b8';
    ctx.fillText('TIME LEFT', timerX, 36);

    ctx.font = '900 30px "Fredoka", monospace';
    ctx.fillStyle = isUrgent ? '#ff3366' : '#ffffff';
    const totalSeconds = Math.max(0, Math.ceil(state.timeLeft));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeStr = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    ctx.fillText(timeStr, timerX, 68);

    // 2. SCORE
    const scoreX = 250;
    ctx.font = 'bold 11px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('SCORE', scoreX, 36);

    ctx.font = '900 32px "Fredoka", system-ui, sans-serif';
    ctx.fillStyle = '#fee440';
    ctx.fillText(`${state.score.toLocaleString()}`, scoreX, 68);

    // 3. COMBO MULTIPLIER & COMBO BAR
    const comboX = 490;
    ctx.font = 'bold 11px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = state.combo > 1 ? '#00f5d4' : '#94a3b8';
    ctx.fillText('COMBO STREAK', comboX, 36);

    ctx.font = '900 30px "Fredoka", system-ui, sans-serif';
    ctx.fillStyle = state.combo > 1 ? (state.combo >= 4 ? '#f72585' : '#00f5d4') : '#64748b';
    ctx.fillText(`x${state.combo}`, comboX, 68);

    // Animated combo decay gauge
    if (state.combo > 1) {
      const comboPct = Math.max(0, state.comboTimeLeft / GAME_CONFIG.COMBO.TIMER_SECONDS);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.roundRect(comboX + 54, 50, 95, 10, 4);
      ctx.fill();

      ctx.fillStyle = state.combo >= 4 ? '#f72585' : '#00f5d4';
      ctx.beginPath();
      ctx.roundRect(comboX + 54, 50, 95 * comboPct, 10, 4);
      ctx.fill();
    }

    // 4. DELIVERIES COUNT
    const delX = 720;
    ctx.font = 'bold 11px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('DELIVERED', delX, 36);

    ctx.font = '900 30px "Fredoka", system-ui, sans-serif';
    ctx.fillStyle = '#38b000';
    ctx.fillText(`${state.deliveries}`, delX, 68);

    // 5. CARGO AMMO (Little 3D parcel boxes)
    const ammoX = 900;
    ctx.font = 'bold 11px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    const curType = state.currentDeliveryType || 'EXPRESS';
    const typeLabel = curType === 'PIZZA' ? 'PIZZA [SPACE: HOLD TO CHARGE]' : curType === 'FRAGILE' ? 'FRAGILE [SPACE: CHARGE]' : 'PARCEL [SPACE: CHARGE]';
    ctx.fillText(`CARGO: ${typeLabel}`, ammoX, 36);

    for (let i = 0; i < state.maxPackages; i++) {
      const px = ammoX + i * 28;
      const py = 48;
      const hasPkg = i < state.packagesRemaining;

      if (hasPkg) {
        if (curType === 'PIZZA') {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(px, py, 22, 20, 4);
          ctx.fill();
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(px + 11, py + 10, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (curType === 'FRAGILE') {
          ctx.fillStyle = '#9333ea';
          ctx.beginPath();
          ctx.roundRect(px, py, 22, 20, 4);
          ctx.fill();
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(px + 8, py + 7, 6, 6);
        } else {
          ctx.fillStyle = '#d4a373';
          ctx.beginPath();
          ctx.roundRect(px, py, 22, 20, 4);
          ctx.fill();
          ctx.strokeStyle = '#a16207';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.strokeStyle = '#faedcd';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 11, py);
          ctx.lineTo(px + 11, py + 20);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(px, py, 22, 20, 4);
        ctx.fill();
      }
    }

    if (state.isReloading) {
      ctx.font = 'bold 12px "Fredoka", system-ui, sans-serif';
      ctx.fillStyle = '#ffbe0b';
      ctx.fillText(`RELOADING... ${Math.round(state.reloadProgress * 100)}%`, ammoX + 155, 62);
    }

    // FINAL RUSH BANNER (Urgent visual cue during final 15 seconds)
    if (state.isFinalRush) {
      const pulse = Math.sin(Date.now() * 0.012) * 0.5 + 0.5;
      ctx.save();
      ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + pulse * 0.15})`;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(W / 2 - 140, 92, 280, 28, 14);
      ctx.fill();
      ctx.stroke();

      ctx.font = '900 13px "Fredoka", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('⚡ FINAL RUSH! 2X SCORE BONUS ⚡', W / 2, 111);
      ctx.restore();
    }

    // SUBTLE CONTROLS HINT (Bottom pill)
    const hintY = GAME_CONFIG.CANVAS_HEIGHT - 24;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(W / 2 - 290, hintY - 14, 580, 28, 14);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 12px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('ARROWS: Drive  •  Z: Drift  •  SPACE: Hold to Charge & Release to Throw', W / 2, hintY + 3);
  }

  private renderTargetPointers(
    ctx: CanvasRenderingContext2D,
    carX: number,
    carY: number,
    targets: DeliveryTarget[],
    cameraX: number,
    cameraY: number
  ): void {
    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;
    const margin = 55;

    for (const t of targets) {
      if (!t.active) continue;

      const screenX = t.x - cameraX;
      const screenY = t.y - cameraY;

      if (screenX >= margin && screenX <= W - margin && screenY >= margin && screenY <= H - margin) {
        continue;
      }

      const centerScreenX = W / 2;
      const centerScreenY = H / 2;
      const dx = t.x - carX;
      const dy = t.y - carY;
      const angle = Math.atan2(dy, dx);
      const distance = Math.round(Math.hypot(dx, dy));

      const radius = Math.min(W / 2 - margin, H / 2 - margin);
      const px = centerScreenX + Math.cos(angle) * (radius - 12);
      const py = centerScreenY + Math.sin(angle) * (radius - 12);

      // Radar pointer badge
      ctx.save();
      ctx.translate(px, py);

      // Glowing badge backing
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Directional arrow head
      ctx.rotate(angle);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Distance tag
      ctx.save();
      ctx.translate(px, py);
      ctx.font = 'bold 10px "Fredoka", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${distance}m`, 0, 28);
      ctx.restore();
    }
  }

  private renderMenu(ctx: CanvasRenderingContext2D): void {
    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;

    // Dark backdrop overlay
    ctx.fillStyle = 'rgba(10, 15, 25, 0.9)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Glowing arcade game title
    ctx.font = '900 74px "Fredoka", "Impact", sans-serif';
    ctx.fillStyle = '#ff3366';
    ctx.shadowColor = '#f72585';
    ctx.shadowBlur = 30;
    ctx.fillText('PANIC DELIVERY', W / 2, H / 2 - 135);
    ctx.shadowBlur = 0;

    // Subtitle badge
    ctx.font = 'bold 20px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#fee440';
    ctx.fillText('120-SECOND ARCADE DELIVERY RUSH', W / 2, H / 2 - 75);

    // Instruction card
    const cardW = 560;
    const cardH = 175;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W / 2 - cardW / 2, H / 2 - 40, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.font = '16px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('🚚 Drive around the city and launch packages into delivery zones.', W / 2, H / 2 - 10);
    ctx.fillText('⚡ Chain consecutive deliveries to crank your combo multiplier!', W / 2, H / 2 + 20);
    ctx.fillText('💥 Crashing into walls or missing throws breaks your streak.', W / 2, H / 2 + 50);
    ctx.fillText('🎯 Score massive bonus points for long-distance snipes!', W / 2, H / 2 + 80);

    // Big pulsing start button
    const pulse = (Math.sin(Date.now() * 0.006) + 1) * 0.5;
    ctx.font = '900 26px "Fredoka", system-ui, sans-serif';
    ctx.fillStyle = pulse > 0.5 ? '#00f5d4' : '#ffffff';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = pulse * 20;
    ctx.fillText('PRESS [Z] TO START', W / 2, H / 2 + 185);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 13px "Outfit", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('CONTROLS: ARROWS = DRIVE  |  Z = DRIFT / START  |  SPACE = THROW', W / 2, H / 2 + 235);
  }

  private renderGameOver(ctx: CanvasRenderingContext2D, state: GameState): void {
    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;

    ctx.fillStyle = 'rgba(8, 12, 22, 0.93)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '900 64px "Fredoka", "Impact", sans-serif';
    ctx.fillStyle = '#fee440';
    ctx.shadowColor = '#fee440';
    ctx.shadowBlur = 25;
    ctx.fillText('SHIFT COMPLETE!', W / 2, H / 2 - 165);
    ctx.shadowBlur = 0;

    // Rank Badge (S-Rank, A-Rank, etc.)
    let rank = 'B-RANK';
    let rankColor = '#4cc9f0';
    if (state.score >= 5000) {
      rank = 'S-RANK MASTER COURIER';
      rankColor = '#fee440';
    } else if (state.score >= 2500) {
      rank = 'A-RANK SPEED DEMON';
      rankColor = '#00f5d4';
    }

    ctx.font = 'bold 18px "Outfit", sans-serif';
    ctx.fillStyle = rankColor;
    ctx.fillText(rank, W / 2, H / 2 - 110);

    // Summary Card
    const cardW = 480;
    const cardH = 200;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W / 2 - cardW / 2, H / 2 - 80, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 13px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('FINAL SCORE', W / 2, H / 2 - 50);

    ctx.font = '900 48px "Fredoka", system-ui, sans-serif';
    ctx.fillStyle = '#00f5d4';
    ctx.fillText(`${state.score.toLocaleString()}`, W / 2, H / 2 - 10);

    // Stats Grid
    ctx.font = '16px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`Deliveries: ${state.deliveries}`, W / 2 - 110, H / 2 + 50);
    ctx.fillText(`Max Combo: x${state.maxCombo}`, W / 2 + 110, H / 2 + 50);
    ctx.fillText(`Misses: ${state.misses}`, W / 2 - 110, H / 2 + 82);
    ctx.fillText(`Crashes: ${state.crashes}`, W / 2 + 110, H / 2 + 82);

    // Restart action
    const pulse = (Math.sin(Date.now() * 0.006) + 1) * 0.5;
    ctx.font = '900 26px "Fredoka", system-ui, sans-serif';
    ctx.fillStyle = pulse > 0.5 ? '#00f5d4' : '#ffffff';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = pulse * 18;
    ctx.fillText('PRESS [Z] TO PLAY AGAIN', W / 2, H / 2 + 170);
    ctx.shadowBlur = 0;
  }
}
