import {
  SCREEN_W,
  SCREEN_H,
  BOARD_X,
  BOARD_Y,
  BOARD_SIZE,
  CELL,
  COLORS,
  PLAYER_COLORS,
  PLAYER_LIGHT,
  PLAYER_DARK,
  PLAYER_NAMES,
  HOME_POSITIONS,
  STAR_POSITIONS,
  MAIN_PATH,
  HOME_STRETCHES,
  PLAYER_START_INDICES,
  PLAYER_HOME_ENTRIES,
  SAFE_INDICES,
  TEAM_MAP,
  PLAYER_ROTATIONS,
  getCellType,
  isStartCell,
  getStartPlayer,
} from "./constants.js";
import {
  DiceAnimation,
  Token,
  ChatSystem,
  ProfileAvatar,
  MoveSelectionOverlay,
  JunctionArrows,
  SynthesizedAudioManager,
} from "./components.js";

// ─── EMOJI PANEL ─────────────────────────────────────────────────────
class EmojiPanel {
  constructor() {
    this.emojis = ["😀", "😂", "👍", "🔥", "😡"]; // Restricted to 5 essential emojis
    this.visible = false;
  }
  draw(ctx, x, y) {
    if (!this.visible) return;
    const cols = 5,
      rows = 1,
      pad = 10,
      size = 40;
    const w = cols * (size + pad) + pad;
    const h = rows * (size + pad) + pad;
    ctx.fillStyle = "rgba(30,15,50,0.95)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = COLORS.GOLD;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "28px Arial";
    ctx.textAlign = "center";
    for (let i = 0; i < this.emojis.length; i++) {
      const ex = x + pad + (i % cols) * (size + pad) + size / 2;
      const ey = y + pad + size - 8;
      ctx.fillText(this.emojis[i], ex, ey);
    }
  }
  getEmojiGridBounds(x, y) {
    const cols = 5,
      pad = 10,
      size = 40;
    return { cols, pad, size, x, y, rows: 1 };
  }
}

// ─── LUDO GAME CLASS ─────────────────────────────────────────────────
export class LudoGame {
  constructor() {
    this.boardX = BOARD_X;
    this.boardY = BOARD_Y;
    this.boardSize = BOARD_SIZE;
    this.cell = CELL;

    this.clientPlayer = 2; // Govind = Red = Bottom-Left
    this.currentPlayer = 2;
    this.tokens = [];
    this.gameState = "setup";
    this.playerCount = 4;
    this.activePlayerColors = [];
    this.teamUpMode = false;

    this.audio = new SynthesizedAudioManager();
    this.moveSelection = new MoveSelectionOverlay();
    this.junctionArrows = new JunctionArrows();

    this.winner = null;
    this.dice = new DiceAnimation();
    this.rollQueue = [];
    this.lastDiceRollId = 0;
    this.pendingDiceRollTimer = null;

    this.chat = new ChatSystem();
    this.chatRect = { x: 8, y: 110, w: 464, h: 510 };
    this.emojiPanel = new EmojiPanel();
    this.speakerPanelVisible = true;
    this.muteStates = Array.from({ length: 4 }, () => [
      false,
      false,
      false,
      false,
    ]);

    // Initialize tokens
    for (let p = 0; p < 4; p++) {
      const playerTokens = [];
      HOME_POSITIONS[p].forEach((pos, i) => {
        const t = new Token(p, i, pos);
        const [px, py] = this.getCellPixel(pos[0], pos[1]);
        t.px = px;
        t.py = py;
        playerTokens.push(t);
      });
      this.tokens.push(playerTokens);
    }

    this.avatars = [
      new ProfileAvatar(PLAYER_NAMES[0], PLAYER_COLORS[0], [44, 52]),
      new ProfileAvatar(PLAYER_NAMES[1], PLAYER_COLORS[1], [SCREEN_W - 44, 52]),
      new ProfileAvatar(PLAYER_NAMES[2], PLAYER_COLORS[2], [
        44,
        SCREEN_H - 112,
      ]),
      new ProfileAvatar(PLAYER_NAMES[3], PLAYER_COLORS[3], [
        SCREEN_W - 44,
        SCREEN_H - 112,
      ]),
    ];

    this.localMicMuted = false;
    this.remoteMicMuted = [false, false, false, false];

    this.particles = [];
    this.timer = 0;
    this.pendingMove = null;
    this.network = null;
    this.turnEndsAt = 0;
    this.turnDuration = 30000;
  }

  getCellPixel(gx, gy) {
    return [
      this.boardX + gx * this.cell + this.cell / 2,
      this.boardY + gy * this.cell + this.cell / 2,
    ];
  }

  getVisualIndex(p) {
    return (p - this.clientPlayer + 3 + 4) % 4;
  }

  getDefaultActivePlayerColors() {
    if (this.playerCount === 2) {
      return this.clientPlayer === 1 ||
        this.clientPlayer === 3 ||
        this.currentPlayer === 1 ||
        this.currentPlayer === 3
        ? [1, 3]
        : [0, 2];
    }
    if (this.playerCount === 3) return [0, 1, 2];
    return [0, 1, 2, 3];
  }

  getActivePlayerColors() {
    return this.activePlayerColors.length
      ? this.activePlayerColors
      : this.getDefaultActivePlayerColors();
  }

  isActivePlayer(playerIndex) {
    return this.getActivePlayerColors().includes(playerIndex);
  }

  // ─── BOARD DRAWING ──────────────────────────────────────────────
  drawBoard(ctx) {
    const { boardX: bx, boardY: by, cell: C } = this;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = COLORS.BOARD_BORDER;
    ctx.beginPath();
    ctx.roundRect(bx - 8, by - 8, this.boardSize + 16, this.boardSize + 16, 24);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = COLORS.WHITE;
    ctx.beginPath();
    ctx.roundRect(bx, by, this.boardSize, this.boardSize, 16);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, this.boardSize, this.boardSize, 16);
    ctx.clip();

    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        const rx = bx + col * C;
        const ry = by + row * C;
        const cell = getCellType(col, row);

        if (cell.type === "center" || cell.type === "home") continue;

        let bg = COLORS.TRACK_BG;
        let isStretch = false;
        if (cell.type === "stretch") {
          bg = PLAYER_COLORS[cell.player];
          isStretch = true;
        }
        const isStart = isStartCell(col, row);
        if (isStart) bg = PLAYER_COLORS[getStartPlayer(col, row)];

        ctx.fillStyle = bg;
        ctx.fillRect(rx, ry, C, C);

        if (isStretch || isStart) {
          ctx.strokeStyle = "rgba(255,255,255,0.40)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(rx + 1.5, ry + 1.5, C - 3, C - 3);
          ctx.strokeStyle = "rgba(0,0,0,0.22)";
          ctx.lineWidth = 1;
          ctx.strokeRect(rx, ry, C, C);
        } else {
          ctx.strokeStyle = "rgba(170,170,170,0.9)";
          ctx.lineWidth = 1;
          ctx.strokeRect(rx, ry, C, C);
          ctx.strokeStyle = "rgba(230,230,230,0.7)";
          ctx.lineWidth = 1;
          ctx.strokeRect(rx + 2.5, ry + 2.5, C - 5, C - 5);
        }

        if (isStart) {
          this.drawStartArrow(
            ctx,
            col,
            row,
            rx,
            ry,
            C,
            getStartPlayer(col, row),
          );
        }
      }
    }

    this.drawCenter(ctx);
    ctx.restore();

    this.drawHomeBase(ctx, bx, by, PLAYER_COLORS[0], PLAYER_DARK[0], 0);
    this.drawHomeBase(ctx, bx + 9 * C, by, PLAYER_COLORS[1], PLAYER_DARK[1], 1);
    this.drawHomeBase(
      ctx,
      bx + 9 * C,
      by + 9 * C,
      PLAYER_COLORS[2],
      PLAYER_DARK[2],
      2,
    );
    this.drawHomeBase(ctx, bx, by + 9 * C, PLAYER_COLORS[3], PLAYER_DARK[3], 3);

    this.drawStarsOnBoard(ctx);
  }

  drawHomeBase(ctx, x, y, mainColor, darkColor, player) {
    const C = this.cell;
    const size = 6 * C;

    ctx.fillStyle = darkColor;
    ctx.beginPath();
    let radii = [0, 0, 0, 0];
    if (player === 0) radii = [16, 0, 0, 0];
    else if (player === 1) radii = [0, 16, 0, 0];
    else if (player === 2) radii = [0, 0, 16, 0];
    else if (player === 3) radii = [0, 0, 0, 16];
    ctx.roundRect(x, y, size, size, radii);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const margin = C;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(x + margin, y + margin, 4 * C, 4 * C, 20);
    ctx.fill();

    ctx.fillStyle = mainColor;
    const innerM = C * 0.25;
    ctx.beginPath();
    ctx.roundRect(
      x + margin + innerM,
      y + margin + innerM,
      4 * C - innerM * 2,
      4 * C - innerM * 2,
      16,
    );
    ctx.fill();

    const spots = [
      [x + 1.75 * C, y + 1.75 * C],
      [x + 4.25 * C, y + 1.75 * C],
      [x + 1.75 * C, y + 4.25 * C],
      [x + 4.25 * C, y + 4.25 * C],
    ];
    spots.forEach(([sx, sy]) => {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(sx, sy, C * 0.45, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createRadialGradient(
        sx - C * 0.1,
        sy - C * 0.1,
        0,
        sx,
        sy,
        C * 0.35,
      );
      grad.addColorStop(0, "#FFFFFF");
      grad.addColorStop(1, "#DDDDDD");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, C * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, C * 0.38, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  drawStartArrow(ctx, col, row, rx, ry, C, player) {
    const cx = rx + C / 2;
    const cy = ry + C / 2;
    const r = C * 0.36;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(210,0,0,0.88)";
    ctx.lineWidth = r * 0.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.68, cy);
    ctx.lineTo(cx + r * 0.68, cy);
    ctx.strokeStyle = "rgba(210,0,0,0.92)";
    ctx.lineWidth = r * 0.34;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  drawCenter(ctx) {
    const { boardX: bx, boardY: by, cell: C } = this;
    const cx = bx + 7.5 * C,
      cy = by + 7.5 * C;
    const h = C * 1.5;

    const triangles = [
      {
        pts: [
          [cx, cy],
          [cx - h, cy - h],
          [cx + h, cy - h],
        ],
        color: COLORS.BLUE,
      },
      {
        pts: [
          [cx, cy],
          [cx + h, cy - h],
          [cx + h, cy + h],
        ],
        color: COLORS.RED,
      },
      {
        pts: [
          [cx, cy],
          [cx - h, cy + h],
          [cx + h, cy + h],
        ],
        color: COLORS.GREEN,
      },
      {
        pts: [
          [cx, cy],
          [cx - h, cy - h],
          [cx - h, cy + h],
        ],
        color: COLORS.YELLOW,
      },
    ];

    triangles.forEach((t) => {
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      ctx.lineTo(t.pts[1][0], t.pts[1][1]);
      ctx.lineTo(t.pts[2][0], t.pts[2][1]);
      ctx.closePath();
      ctx.fill();
    });
    triangles.forEach((t) => {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      ctx.lineTo(t.pts[1][0], t.pts[1][1]);
      ctx.lineTo(t.pts[2][0], t.pts[2][1]);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(cx, cy, C * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.ceil(C * 0.85)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("🏆", cx, cy + C * 0.3);
  }

  drawStarsOnBoard(ctx) {
    STAR_POSITIONS.forEach(([col, row]) => {
      if (!isStartCell(col, row)) {
        const [px, py] = this.getCellPixel(col, row);
        const r = this.cell * 0.33;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.90)";
        ctx.fill();
        ctx.strokeStyle = "rgba(210,0,0,0.85)";
        ctx.lineWidth = r * 0.28;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - r * 0.68, py);
        ctx.lineTo(px + r * 0.68, py);
        ctx.strokeStyle = "rgba(210,0,0,0.90)";
        ctx.lineWidth = r * 0.32;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  // ─── UPDATE / DRAW ───────────────────────────────────────────────
  update() {
    if (this.gameState === "setup" || this.gameState === "lobby") return;
    this.timer++;
    this.dice.update();

    const now = Date.now();
    let currentTimerPercent = 0;
    if (this.turnEndsAt > now) {
      currentTimerPercent = (this.turnEndsAt - now) / this.turnDuration;
    }

    this.junctionArrows.update();

    this.avatars.forEach((a, i) => {
      a.update();
      a.active = i === this.currentPlayer;
      a.timerPercent = a.active ? currentTimerPercent : 0;
    });

    this.tokens.forEach((pt, p) => {
      if (this.isActivePlayer(p)) {
        pt.forEach((t) => {
          t.update();
          t.isCurrentPlayer = p === this.currentPlayer;
          // FIX: check ALL rolls in queue, not just first
          if (t.isCurrentPlayer && this.rollQueue.length > 0) {
            t.isMoveable = this.rollQueue.some((r) => this.canTokenMove(t, r));
          } else {
            t.isMoveable = false;
          }
        });
      }
    });
  }

  draw(ctx) {
    if (this.gameState === "setup") {
      this.drawSetupScreen(ctx);
      return;
    }

    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // --- POV BOARD ROTATION ---
    const cx = BOARD_X + BOARD_SIZE / 2;
    const cy = BOARD_Y + BOARD_SIZE / 2;
    const angle = PLAYER_ROTATIONS[this.clientPlayer] || 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.translate(-cx, -cy);

    this.drawBoard(ctx);
    this.tokens.forEach((pt, p) => {
      if (this.isActivePlayer(p)) pt.forEach((t) => t.draw(ctx));
    });

    ctx.restore();
    // --- END ROTATION ---

    // FIX: Junction arrows drawn OUTSIDE rotation (UI layer) so they appear correctly
    // They use screen-space coordinates that we calculate from board coords
    this.junctionArrows.draw(ctx);

    // UI Overlays (Not rotated)
    this.drawTopBar(ctx);
    this.drawBottomBar(ctx);
    this.drawDiceArea(ctx);
    this.drawParticles(ctx);

    if (this.moveSelection.activeToken) {
      const t = this.moveSelection.activeToken;
      const [sx, sy] = this.boardToScreen(t.px + t.offset.x, t.py + t.offset.y);
      this.moveSelection.draw(ctx, sx, sy);
    }

    if (this.chat.visible) {
      this.chat.draw(
        ctx,
        this.chatRect.x,
        this.chatRect.y,
        this.chatRect.w,
        this.chatRect.h,
      );
    }

    if (this.emojiPanel.visible) this.emojiPanel.draw(ctx, 20, 520);

    if (this.winner !== null) this.drawWinnerScreen(ctx);
  }

  // ─── SETUP SCREEN ────────────────────────────────────────────────
  drawSetupScreen(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
    grad.addColorStop(0, "#1A0A35");
    grad.addColorStop(1, "#4A1A6B");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    ctx.fillStyle = COLORS.GOLD;
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🎲 LUDO STAR", SCREEN_W / 2, 120);
    ctx.font = "16px Arial";
    ctx.fillStyle = COLORS.GRAY;
    ctx.fillText("Select number of players", SCREEN_W / 2, 155);

    [2, 3, 4].forEach((n, i) => {
      const x = SCREEN_W / 2,
        y = 220 + i * 85;
      const selected = this.playerCount === n;
      ctx.fillStyle = selected ? COLORS.GOLD : "#3A1060";
      ctx.beginPath();
      ctx.roundRect(x - 80, y - 28, 160, 56, 16);
      ctx.fill();
      ctx.strokeStyle = selected ? "#FFFFFF" : COLORS.PURPLE;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = selected ? "#000" : COLORS.WHITE;
      ctx.font = `bold 20px Arial`;
      ctx.fillText(`${n} Players`, x, y + 8);
    });

    if (this.playerCount === 4) {
      const tx = SCREEN_W / 2,
        ty = 488;
      ctx.fillStyle = this.teamUpMode ? COLORS.GREEN : "#3A1060";
      ctx.beginPath();
      ctx.roundRect(tx - 90, ty - 24, 180, 48, 14);
      ctx.fill();
      ctx.strokeStyle = this.teamUpMode ? "#FFFFFF" : COLORS.PURPLE;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = COLORS.WHITE;
      ctx.font = "bold 17px Arial";
      ctx.fillText(
        this.teamUpMode ? "✅ TEAM UP ON" : "👥 TEAM UP",
        tx,
        ty + 7,
      );
    }

    const sy = this.playerCount === 4 ? 575 : 490;
    ctx.fillStyle = COLORS.GREEN;
    ctx.beginPath();
    ctx.roundRect(SCREEN_W / 2 - 70, sy - 26, 140, 52, 14);
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 22px Arial";
    ctx.fillText("▶ START", SCREEN_W / 2, sy + 9);
  }

  // ─── TOP BAR ─────────────────────────────────────────────────────
  drawTopBar(ctx) {
    ctx.fillStyle = "rgba(10, 5, 20, 0.92)";
    ctx.fillRect(0, 0, SCREEN_W, 108);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 108);
    ctx.lineTo(SCREEN_W, 108);
    ctx.stroke();

    for (const p of this.getActivePlayerColors()) {
      const v = this.getVisualIndex(p);
      if (v === 0 || v === 1) this.drawPlayerCard(ctx, p, v);
    }
  }

  // ─── BOTTOM BAR ──────────────────────────────────────────────────
  drawBottomBar(ctx) {
    const barY = SCREEN_H - 160;
    ctx.fillStyle = "rgba(10, 5, 20, 0.92)";
    ctx.fillRect(0, barY, SCREEN_W, 160);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, barY);
    ctx.lineTo(SCREEN_W, barY);
    ctx.stroke();

    for (const p of this.getActivePlayerColors()) {
      const v = this.getVisualIndex(p);
      if (v === 2 || v === 3) this.drawPlayerCard(ctx, p, v);
    }

    const buttons = [
      { id: "emoji", label: "EMOJI", state: this.emojiPanel.visible },
      { id: "chat", label: "CHAT", state: this.chat.visible },
      { id: "mic", label: "MIC", state: !this.localMicMuted },
      { id: "audio", label: "AUDIO", state: this.speakerPanelVisible },
    ];

    buttons.forEach((btn, i) => {
      const bx = 12 + i * 50; // Reduced spacing from 80 to 50
      const by = SCREEN_H - 40; // Moved up slightly from 48 to 40
      const iconSize = 24; // Smaller icons

      const iconX = bx + iconSize / 2;
      const iconY = by + iconSize / 2;
      ctx.fillStyle = btn.state ? "#ffffff" : "rgba(255,255,255,0.6)"; // White when active, semi-transparent when inactive
      ctx.strokeStyle = btn.state ? "#ffffff" : "rgba(255,255,255,0.3)";

      if (btn.id === "emoji") {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(iconX, iconY, 8, 0, Math.PI * 2); // Smaller circle
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(iconX - 2.5, iconY - 2, 1, 0, Math.PI * 2); // Smaller eyes
        ctx.fill();
        ctx.beginPath();
        ctx.arc(iconX + 2.5, iconY - 2, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(iconX, iconY, 4, 0, Math.PI); // Smaller smile
        ctx.stroke();
      } else if (btn.id === "chat") {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(iconX - 8, iconY - 6, 16, 12, 3); // Smaller chat bubble
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(iconX - 4, iconY + 6);
        ctx.lineTo(iconX - 2, iconY + 10);
        ctx.lineTo(iconX + 1, iconY + 6);
        ctx.fill();
      } else if (btn.id === "mic") {
        ctx.beginPath();
        ctx.roundRect(iconX - 2, iconY - 6, 4, 9, 2); // Smaller mic body
        ctx.fill();
        ctx.beginPath();
        ctx.arc(iconX, iconY - 1, 6, 0, Math.PI); // Smaller mic arc
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(iconX, iconY + 5);
        ctx.lineTo(iconX, iconY + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(iconX - 3, iconY + 8);
        ctx.lineTo(iconX + 3, iconY + 8);
        ctx.stroke();
        if (this.localMicMuted) {
          ctx.strokeStyle = "#FF3333";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(iconX - 8, iconY - 6);
          ctx.lineTo(iconX + 8, iconY + 6);
          ctx.stroke();
        }
      } else if (btn.id === "audio") {
        ctx.beginPath();
        ctx.moveTo(iconX - 5, iconY - 2);
        ctx.lineTo(iconX - 2, iconY - 2);
        ctx.lineTo(iconX + 1, iconY - 5);
        ctx.lineTo(iconX + 1, iconY + 5);
        ctx.lineTo(iconX - 2, iconY + 2);
        ctx.lineTo(iconX - 5, iconY + 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(iconX + 1, iconY, 4, -Math.PI / 3, Math.PI / 3); // Smaller speaker waves
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(iconX + 1, iconY, 6, -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
        if (!this.speakerPanelVisible) {
          ctx.strokeStyle = "#FF3333";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(iconX - 6, iconY - 6);
          ctx.lineTo(iconX + 8, iconY + 6);
          ctx.stroke();
        }
      }
    });
  }

  // ─── PLAYER CARD ─────────────────────────────────────────────────
  drawPlayerCard(ctx, i, v) {
    const isTop = v <= 1;
    const isRight = v === 1 || v === 2;
    const isActive = i === this.currentPlayer;
    const color = PLAYER_COLORS[i];
    const name = PLAYER_NAMES[i];

    const avR = 30;
    const avX = isRight ? SCREEN_W - 14 - avR : 14 + avR;
    const avY = isTop ? 78 : SCREEN_H - 108;

    this.avatars[i].position = [avX, avY];
    this.avatars[i].setPosition(avX, avY);

    if (isActive) {
      const pulse = (Math.sin(this.timer * 0.12) + 1) / 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.3 + pulse * 0.6})`;
      ctx.lineWidth = 3 + pulse * 3;
      ctx.beginPath();
      ctx.arc(avX, avY, avR + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    const grad = ctx.createRadialGradient(avX - 8, avY - 8, 2, avX, avY, avR);
    grad.addColorStop(0, PLAYER_LIGHT[i]);
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (!isActive) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name.substring(0, 2).toUpperCase(), avX, avY);
      ctx.textBaseline = "alphabetic";
    }

    ctx.strokeStyle = isActive ? "#fff" : COLORS.GOLD;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "11px Inter, Arial";
    ctx.textAlign = "center";
    ctx.fillText(name.substring(0, 14), avX, avY + avR + 14);

    if (isActive) {
      const timerR = avR + 11;
      const percent = Math.max(
        0.001,
        Math.min(1, this.avatars[i].timerPercent || 0),
      );

      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 6;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.arc(avX, avY, timerR, 0, Math.PI * 2);
      ctx.stroke();

      let timerColor = "#4CAF50";
      if (percent < 0.25) timerColor = "#F44336";
      else if (percent < 0.55) timerColor = "#FF9800";

      ctx.strokeStyle = timerColor;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(
        avX,
        avY,
        timerR,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * percent,
      );
      ctx.stroke();
      ctx.lineCap = "butt";

      ctx.fillStyle = "rgba(0, 0, 0, 0.60)";
      ctx.beginPath();
      ctx.arc(avX, avY, avR - 1, 0, Math.PI * 2);
      ctx.fill();

      const secs = Math.ceil(percent * 10);
      ctx.fillStyle = timerColor;
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(secs, avX, avY);
      ctx.textBaseline = "alphabetic";
    }

    // AUTO/OFFLINE badge
    const badgeW = 72,
      badgeH = 26;
    const badgeX = avX - badgeW / 2;
    const badgeY = isTop ? avY - avR - 28 : avY + avR + 12; // Moved higher (reduced offset from 38 to 28 for top, 22 to 12 for bottom)

    const showBadge = this.avatars[i].botEnabled || !this.avatars[i].isOnline;
    if (showBadge) {
      const isOffline = !this.avatars[i].isOnline;
      const badgeText = isOffline ? "OFFLINE" : "AUTO";

      ctx.fillStyle = isOffline ? "#dc2626" : "#15803d"; // Red for offline, green for auto
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
      ctx.fill();

      ctx.strokeStyle = isOffline ? "#ef4444" : "#4ade80";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, badgeX + 24, badgeY + 13);

      const tbX = badgeX + 46,
        tbY = badgeY + 5;
      ctx.fillStyle = isOffline ? "#991b1b" : "#166534";
      ctx.beginPath();
      ctx.roundRect(tbX, tbY, 20, 16, 4);
      ctx.fill();
      ctx.strokeStyle = isOffline ? "#ef4444" : "#4ade80";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!isOffline) {
        // Only show checkmark for AUTO (bots)
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(tbX + 4, tbY + 8);
        ctx.lineTo(tbX + 8, tbY + 12);
        ctx.lineTo(tbX + 16, tbY + 4);
        ctx.stroke();
      }
    }

    const secs2 = Math.ceil((this.avatars[i].timerPercent || 0) * 10);
    if (
      isActive &&
      secs2 <= 3 &&
      secs2 > 0 &&
      !this.avatars[i].botEnabled &&
      this.avatars[i].isOnline
    ) {
      const arrowX = avX;
      const arrowY = badgeY - 14 + Math.sin(this.timer * 0.2) * 4;
      ctx.fillStyle = "#22c55e";
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(arrowX - 8, arrowY);
      ctx.lineTo(arrowX + 8, arrowY);
      ctx.lineTo(arrowX, arrowY + 12);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (i !== this.clientPlayer && this.isActivePlayer(i)) {
      const { x: spkX, y: spkY, r: spkR } = this.getPlayerMuteButtonRect(i);
      const isMuted = !this.speakerPanelVisible || this.remoteMicMuted[i];
      ctx.fillStyle = isMuted ? "rgba(90,12,28,0.92)" : "rgba(10,5,20,0.8)";
      ctx.beginPath();
      ctx.arc(spkX, spkY, spkR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isMuted ? "#FF5A5F" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = isMuted ? 1.5 : 1;
      ctx.stroke();
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.moveTo(spkX - 3, spkY - 2);
      ctx.lineTo(spkX - 1, spkY - 2);
      ctx.lineTo(spkX + 2, spkY - 4);
      ctx.lineTo(spkX + 2, spkY + 4);
      ctx.lineTo(spkX - 1, spkY + 2);
      ctx.lineTo(spkX - 3, spkY + 2);
      ctx.closePath();
      ctx.fill();

      if (isMuted) {
        ctx.strokeStyle = "#FF3333";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(spkX - 7, spkY - 7);
        ctx.lineTo(spkX + 7, spkY + 7);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#FFF";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(spkX + 1, spkY, 4, -Math.PI / 4, Math.PI / 4);
        ctx.stroke();
      }
    }
  }

  getPlayerMuteButtonRect(playerIndex) {
    const avatar = this.avatars[playerIndex];
    const [avX, avY] = avatar.position;
    const v = this.getVisualIndex(playerIndex);
    const isRight = v === 1 || v === 2;
    const avR = 30;
    return {
      x: isRight ? avX - avR - 10 : avX + avR + 10,
      y: avY + 12,
      r: 12,
    };
  }

  toggleRemotePlayerMute(playerIndex) {
    if (playerIndex === this.clientPlayer) return false;
    this.remoteMicMuted[playerIndex] = !this.remoteMicMuted[playerIndex];
    if (this.network && this.network.setPlayerMuted) {
      this.network.setPlayerMuted(
        playerIndex,
        this.remoteMicMuted[playerIndex],
      );
    }
    return this.remoteMicMuted[playerIndex];
  }

  setGlobalSpeakerEnabled(enabled) {
    this.speakerPanelVisible = Boolean(enabled);
    if (this.network && this.network.setGlobalSpeakerEnabled) {
      this.network.setGlobalSpeakerEnabled(this.speakerPanelVisible);
    }
  }

  // ─── DICE AREA ───────────────────────────────────────────────────
  drawDiceArea(ctx) {
    if (this.gameState === "setup") return;

    const v = this.getVisualIndex(this.currentPlayer);

    const dicePositions = {
      3: { x: 92, y: SCREEN_H - 152 },
      0: { x: 92, y: 18 },
      1: { x: SCREEN_W - 238, y: 18 },
      2: { x: SCREEN_W - 238, y: SCREEN_H - 152 },
    };

    const pos = dicePositions[v];
    const clX = pos.x;
    const clY = pos.y;

    this.draw3DDice(ctx, clX, clY, 46);

    const crX = clX + 62;
    const crY = clY + 23;
    const crR = 22;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = this.gameState === "roll" ? COLORS.RED : "#444";
    ctx.beginPath();
    ctx.arc(crX, crY, crR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(crX, crY, crR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.GOLD;
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♛", crX, crY);
    ctx.textBaseline = "alphabetic";

    if (this.rollQueue.length > 0) {
      const rvX = clX + 132;
      const rvY = clY + 18;
      ctx.fillStyle = PLAYER_COLORS[this.currentPlayer];
      ctx.beginPath();
      ctx.arc(rvX, rvY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rvX, rvY, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(this.rollQueue[0]), rvX, rvY);
      ctx.textBaseline = "alphabetic";
    }

    if (
      this.network &&
      this.currentPlayer === this.network.playerColor &&
      this.gameState === "roll" &&
      !this.dice.rolling
    ) {
      this.drawRollHint(ctx, clX + 23, clY + 23);
    }
  }

  drawRollHint(ctx, x, y) {
    ctx.save();
    const bounce = Math.sin(this.timer * 0.15) * 10;
    const tx = x,
      ty = y - 65 + bounce;

    ctx.fillStyle = "#4CAF50";
    ctx.shadowColor = "rgba(76, 175, 80, 0.8)";
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.roundRect(tx - 6, ty - 25, 12, 25, 4);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(tx - 18, ty);
    ctx.lineTo(tx + 18, ty);
    ctx.lineTo(tx, ty + 20);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  draw3DDice(ctx, x, y, size) {
    const val = this.dice.rolling ? this.dice.displayValue : this.dice.value;
    const r = 10;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(x + 5, y + 5, size, size, r + 2);
    ctx.fill();

    const bodyGrad = ctx.createLinearGradient(x, y, x + size, y + size);
    bodyGrad.addColorStop(0, "#FFFFFF");
    bodyGrad.addColorStop(0.5, "#F0F0F0");
    bodyGrad.addColorStop(1, "#D0D0D0");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.fill();

    ctx.strokeStyle = "#A0A0A0";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, size - 6, size - 6, r - 2);
    ctx.stroke();

    const shineGrad = ctx.createLinearGradient(
      x,
      y,
      x + size * 0.5,
      y + size * 0.5,
    );
    shineGrad.addColorStop(0, "rgba(255,255,255,0.6)");
    shineGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shineGrad;
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, size - 8, size * 0.55, r - 3);
    ctx.fill();

    const dp = {
      1: [[0.5, 0.5]],
      2: [
        [0.25, 0.28],
        [0.75, 0.72],
      ],
      3: [
        [0.25, 0.25],
        [0.5, 0.5],
        [0.75, 0.75],
      ],
      4: [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ],
      5: [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.5, 0.5],
        [0.25, 0.75],
        [0.75, 0.75],
      ],
      6: [
        [0.25, 0.22],
        [0.75, 0.22],
        [0.25, 0.5],
        [0.75, 0.5],
        [0.25, 0.78],
        [0.75, 0.78],
      ],
    };
    const dots = dp[val] || [];
    dots.forEach(([dx, dy]) => {
      const dotX = x + dx * size;
      const dotY = y + dy * size;
      const dotR = size / 10;
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath();
      ctx.arc(dotX + 1, dotY + 1, dotR, 0, Math.PI * 2);
      ctx.fill();
      const dotGrad = ctx.createRadialGradient(
        dotX - 1,
        dotY - 1,
        0,
        dotX,
        dotY,
        dotR,
      );
      dotGrad.addColorStop(0, "#555");
      dotGrad.addColorStop(1, "#111");
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ─── PARTICLES ───────────────────────────────────────────────────
  drawParticles(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life--;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  spawnParticles(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * -6 - 1,
        color,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        size: 3 + Math.random() * 4,
      });
    }
  }

  // ─── GAME LOGIC ──────────────────────────────────────────────────
  rollDice() {
    if (this.gameState !== "roll" || this.dice.rolling) return;

    this.dice.roll();
    this.audio.playDiceRoll();

    setTimeout(() => {
      const val = this.dice.value;
      this.rollQueue.push(val);
      this.chat.addMessage(
        PLAYER_NAMES[this.currentPlayer],
        `Rolled ${val}!`,
        PLAYER_COLORS[this.currentPlayer],
      );

      const sixCount = this.rollQueue.filter((v) => v === 6).length;

      if (sixCount >= 3) {
        // Teen 6 = turn khatam
        this.rollQueue = [];
        this.nextTurn();
        return;
      }

      if (val === 6) {
        // 6 aaya = roll again, gameState "roll" hi rehta hai
        return;
      }

      // 6 nahi aaya = move phase
      this.gameState = "move";

      if (!this.canAnyMove()) {
        setTimeout(() => this.nextTurn(), 800);
      }
    }, 600);
  }

  canAnyMove() {
    const pIndex = this.currentPlayer;
    const playerTokens = this.tokens[pIndex];
    return playerTokens.some((token) =>
      this.rollQueue.some((roll) => this.canTokenMove(token, roll)),
    );
  }

  canTokenMove(token, roll) {
    if (token.finished) return false;
    if (token.inHome) return roll === 6;
    const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
    const maxSteps = effectiveLapEnd + 6;
    if (token.steps + roll > maxSteps) return false;
    return true;
  }

  handleTokenClick(x, y) {
    // ALLOW CLICK IF IN 'move' OR IF 'roll' BUT WE HAVE DICE READY (like after a 6)
    if (
      this.gameState !== "move" &&
      (this.gameState !== "roll" || this.rollQueue.length === 0)
    )
      return;

    const pIndex = this.currentPlayer;
    const playerTokens = this.tokens[pIndex];

    for (const t of playerTokens) {
      const dx = x - (t.px + t.offset.x);
      const dy = y - (t.py + t.offset.y);
      if (Math.sqrt(dx * dx + dy * dy) < 24) {
        const validRolls = this.rollQueue.filter((r) =>
          this.canTokenMove(t, r),
        );

        if (validRolls.length === 0) continue;

        if (validRolls.length > 1) {
          const uniqueRolls = [...new Set(validRolls)];
          const [sx, sy] = this.boardToScreen(
            t.px + t.offset.x,
            t.py + t.offset.y,
          );
          this.moveSelection.show(t, uniqueRolls);
        } else {
          this.moveSelection.hide();
          if (this.network) {
            this.network.moveToken(t.index, validRolls[0]);
          }
          this.performTokenMove(t, validRolls[0]);
        }
        break;
      }
    }
  }

  performTokenMove(token, roll) {
    this.rollQueue.splice(this.rollQueue.indexOf(roll), 1);
    this.audio.playMove();
    this.moveSelection.hide();

    const startSteps = token.steps;

    if (token.inHome) {
      token.inHome = false;
      token.steps = 1;
      this.moveTokenSequentially(token, 0, 1);
      setTimeout(() => this.postMoveLogic(token), 200);
      return;
    }

    const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
    const endSteps = startSteps + roll;

    // FIX: Junction — token puri tarah lap end tak pahunche tab hi choice dikhao
    if (startSteps < effectiveLapEnd && endSteps >= effectiveLapEnd) {
      this.moveTokenSequentially(token, startSteps, effectiveLapEnd);
      token.steps = effectiveLapEnd;

      const stepsRemaining = endSteps - effectiveLapEnd;

      setTimeout(
        () => {
          this.showJunctionUI(token, stepsRemaining);
        },
        (effectiveLapEnd - startSteps) * 120 + 150,
      );
    } else {
      this.finishMove(token, startSteps, endSteps);
    }
  }

  // FIX: Junction UI — screen-space coordinates use karo (rotation ke baad)
  showJunctionUI(token, stepsRemaining) {
    token.decisionPending = true;
    this.pendingMove = { token, stepsRemaining };
    this.gameState = "junction";

    // FIX: Token ki current px/py use karo (already rotated screen coords)
    // JunctionArrows ab UI layer pe draw hoti hai, isliye screen coords chahiye

    // Home stretch first cell — screen coords nikalo via rotation transform
    const homeCell = HOME_STRETCHES[token.player][0];
    const [hbx, hby] = this.getCellPixel(homeCell[0], homeCell[1]);
    const homeScreenPt = this.boardToScreen(hbx, hby);

    // Lap continue — main path pe next cell
    const nextLapIndex =
      (token.steps + PLAYER_START_INDICES[token.player]) % 52;
    const lapCell = MAIN_PATH[nextLapIndex];
    const [lbx, lby] = this.getCellPixel(lapCell[0], lapCell[1]);
    const lapScreenPt = this.boardToScreen(lbx, lby);

    // Token screen position
    const tokenScreenPt = this.boardToScreen(token.px, token.py);

    this.junctionArrows.show(
      { px: tokenScreenPt[0], py: tokenScreenPt[1] },
      homeScreenPt,
      lapScreenPt,
      stepsRemaining,
    );
  }

  // FIX: Convert board coordinates to screen coordinates (applying rotation)
  boardToScreen(bx, by) {
    const cx = BOARD_X + BOARD_SIZE / 2;
    const cy = BOARD_Y + BOARD_SIZE / 2;
    const angle = PLAYER_ROTATIONS[this.clientPlayer] || 0;
    const dx = bx - cx;
    const dy = by - cy;
    const sx = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
    const sy = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
    return [sx, sy];
  }

  resolveJunction(choice) {
    if (!this.pendingMove) return;
    const { token, stepsRemaining } = this.pendingMove;

    token.decisionPending = false;
    this.junctionArrows.hide();

    const fromSteps = token.steps;

    if (choice === "lap") {
      // FIX: lapCount pehle badhao, PHIR moveTokenSequentially call karo
      token.lapCount = (token.lapCount || 0) + 1;
      token.steps = fromSteps + stepsRemaining;
      this.moveTokenSequentially(token, fromSteps, token.steps);
    } else {
      // home stretch
      token.steps = fromSteps + stepsRemaining;
      this.moveTokenSequentially(token, fromSteps, token.steps);
    }

    this.pendingMove = null;
    this.gameState = "move";

    setTimeout(() => this.postMoveLogic(token), stepsRemaining * 120 + 100);
  }

  finishMove(token, from, to) {
    token.steps = to;
    this.moveTokenSequentially(token, from, to);
    setTimeout(() => this.postMoveLogic(token), (to - from) * 80 + 50);
  }

  moveTokenSequentially(token, from, to) {
    // FIX: effectiveLapEnd token ki CURRENT lapCount se calculate karo
    const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
    for (let s = from + 1; s <= to; s++) {
      let coord;
      if (s <= effectiveLapEnd) {
        const idx = (s - 1 + PLAYER_START_INDICES[token.player]) % 52;
        const [c, r] = MAIN_PATH[idx];
        coord = this.getCellPixel(c, r);
      } else {
        const homeStep = s - effectiveLapEnd;
        const hIdx = Math.min(5, homeStep - 1); // FIX: 0-indexed (homeStep 1 = index 0)
        const [c, r] = HOME_STRETCHES[token.player][hIdx];
        coord = this.getCellPixel(c, r);
      }
      token.moveQueue.push(coord);
    }
  }

  postMoveLogic(token) {
    const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);

    // FIX: Finished check
    if (token.steps >= effectiveLapEnd + 6) {
      token.finished = true;
      token.steps = effectiveLapEnd + 6; // clamp
      this.audio.playWin();
      this.spawnParticles(token.px, token.py, COLORS.GOLD, 40);

      // FIX: Winner check karo
      const allFinished = this.tokens[token.player].every((t) => t.finished);
      if (allFinished) {
        this.winner = token.player;
        this.gameState = "end";
        return;
      }
    } else {
      // FIX: Sirf tab collision check karo jab token finished nahi hua
      this.checkCollisions(token);
    }

    this.updateTokenStacking();
    if (this.rollQueue.length === 0 || !this.canAnyMove()) this.nextTurn();
  }

  checkCollisions(movedToken) {
    const effectiveLapEnd = 51 + 52 * (movedToken.lapCount || 0);
    if (movedToken.steps > effectiveLapEnd) return; // Home stretch mein safe

    const movedIdx =
      (movedToken.steps - 1 + PLAYER_START_INDICES[movedToken.player]) % 52;
    if (SAFE_INDICES.includes(movedIdx)) return;

    // Saare enemy tokens jo same cell pe hain
    const enemiesOnCell = [];

    this.tokens.forEach((pt, p) => {
      if (p === movedToken.player) return;

      pt.forEach((t) => {
        if (t.inHome || t.finished) return;
        const tLapEnd = 51 + 52 * (t.lapCount || 0);
        if (t.steps < 1 || t.steps > tLapEnd) return;
        const tIdx = (t.steps - 1 + PLAYER_START_INDICES[t.player]) % 52;
        if (tIdx === movedIdx) {
          enemiesOnCell.push(t);
        }
      });
    });

    if (enemiesOnCell.length === 0) return;

    // Group by player
    const byPlayer = {};
    enemiesOnCell.forEach((t) => {
      if (!byPlayer[t.player]) byPlayer[t.player] = [];
      byPlayer[t.player].push(t);
    });

    let toKill = [];

    // FIX: 2+ same player tokens = DONO kill (aane wala token nahi rukta)
    Object.values(byPlayer).forEach((group) => {
      // Chahe 1 ho ya 2+, sab kill
      toKill.push(...group);
    });

    // Execute kills
    toKill.forEach((t) => {
      this.sendTokenHome(t);
      this.spawnParticles(t.px, t.py, COLORS.RED, 25);
    });

    if (toKill.length > 0) {
      this.audio.playKill();
      const msg =
        toKill.length >= 2
          ? `${PLAYER_NAMES[movedToken.player]} ne ${toKill.length} tokens ek saath kill kiya! 💥`
          : `${PLAYER_NAMES[movedToken.player]} ne kill kiya!`;
      this.chat.addMessage("Game", msg, COLORS.GOLD);
    }
  }

  // FIX: sendTokenHome — px/py bhi immediately update karo
  sendTokenHome(token) {
    token.inHome = true;
    token.steps = 0;
    token.lapCount = 0;
    const homePos = HOME_POSITIONS[token.player][token.index];
    const [hx, hy] = this.getCellPixel(homePos[0], homePos[1]);
    token.px = hx;
    token.py = hy;
    token.moveQueue = []; // koi pending animation nahi
    token.offset = { x: 0, y: 0 };
  }

  updateTokenStacking() {
    const map = new Map();
    this.tokens.forEach((pt) =>
      pt.forEach((t) => {
        if (t.inHome || t.finished) {
          t.offset = { x: 0, y: 0 };
          return;
        }
        const effectiveLapEnd = 51 + 52 * (t.lapCount || 0);
        const key =
          t.steps > effectiveLapEnd
            ? `H${t.player}-${t.steps - effectiveLapEnd}`
            : `M${(t.steps - 1 + PLAYER_START_INDICES[t.player]) % 52}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
      }),
    );
    map.forEach((group) => {
      if (group.length > 1)
        group.forEach((t, i) => {
          const a = (Math.PI * 2 * i) / group.length;
          t.offset = { x: Math.cos(a) * 9, y: Math.sin(a) * 9 };
        });
      else group[0].offset = { x: 0, y: 0 };
    });
  }

  nextTurn() {
    this.rollQueue = [];
    this.pendingMove = null;
    this.junctionArrows.hide();

    this.tokens[this.currentPlayer].forEach((t) => (t.decisionPending = false));

    const order = this.getActivePlayerColors();

    const ci = order.indexOf(this.currentPlayer);
    this.currentPlayer = order[(ci + 1) % order.length];

    this.gameState = "roll";

    this.avatars.forEach((a, i) => (a.active = i === this.currentPlayer));
  }

  // ─── WINNER SCREEN ───────────────────────────────────────────────
  drawWinnerScreen(ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = "#2C0E4B";
    ctx.beginPath();
    ctx.roundRect(60, 180, 360, 320, 24);
    ctx.fill();
    ctx.strokeStyle = COLORS.GOLD;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = "56px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🏆", SCREEN_W / 2, 265);
    ctx.fillStyle = COLORS.GOLD;
    ctx.font = "bold 28px Arial";
    ctx.fillText("WINNER!", SCREEN_W / 2, 310);

    let winName = PLAYER_NAMES[this.winner || 0];
    if (this.teamUpMode)
      winName =
        TEAM_MAP[this.winner || 0] === 0 ? "TEAM A 🟢🔴" : "TEAM B 🟡🔵";
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 20px Arial";
    ctx.fillText(winName, SCREEN_W / 2, 355);

    ctx.fillStyle = COLORS.GREEN;
    ctx.beginPath();
    ctx.roundRect(SCREEN_W / 2 - 70, 420, 140, 50, 14);
    ctx.fill();
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 18px Arial";
    ctx.fillText("Play Again", SCREEN_W / 2, 451);
  }

  // ─── NETWORK SYNC METHODS ────────────────────────────────────────

  updateLobbyPlayers(players) {
    this.activePlayerColors = players
      .map((p) => p.color)
      .filter((color) => Number.isInteger(color))
      .sort((a, b) => a - b);

    players.forEach((p) => {
      PLAYER_NAMES[p.color] = p.name;
      if (this.avatars[p.color]) {
        this.avatars[p.color].name = p.name;
        this.avatars[p.color].initials = p.name.substring(0, 2).toUpperCase();
        this.avatars[p.color].botEnabled = !!p.botEnabled;
        this.avatars[p.color].isOnline = !!p.online;
      }
    });
  }

  startGameFromServer(state) {
    this.syncState(state);
  }

  syncState(state) {
    this.gameState = state.gameState;
    this.currentPlayer = state.currentPlayer;
    this.playerCount = state.playerCount || this.playerCount;
    if (this.activePlayerColors.length < this.playerCount) {
      this.activePlayerColors = this.getDefaultActivePlayerColors();
    }
    this.rollQueue = [...state.rollQueue];
    if (state.rollSeq !== undefined) {
      this.lastDiceRollId = Math.max(this.lastDiceRollId, state.rollSeq);
    }
    if (this.pendingDiceRollTimer) {
      clearTimeout(this.pendingDiceRollTimer);
      this.pendingDiceRollTimer = null;
    }
    if (state.winner !== null && state.winner !== undefined) {
      this.winner = state.winner;
    }

    for (let p = 0; p < 4; p++) {
      for (let i = 0; i < 4; i++) {
        const sv = state.tokens[p][i];
        const tv = this.tokens[p][i];
        tv.steps = sv.steps;
        tv.inHome = sv.inHome;
        tv.finished = sv.finished;
        tv.lapCount = sv.lapCount;

        if (tv.inHome) {
          const [hx, hy] = this.getCellPixel(
            HOME_POSITIONS[p][i][0],
            HOME_POSITIONS[p][i][1],
          );
          tv.px = hx;
          tv.py = hy;
        } else if (tv.finished) {
          const [fcx, fcy] = this.getCellPixel(7, 7);
          tv.px = fcx;
          tv.py = fcy;
        } else {
          const effectiveLapEnd = 51 + 52 * (tv.lapCount || 0);
          if (tv.steps <= effectiveLapEnd) {
            const idx = (tv.steps - 1 + PLAYER_START_INDICES[p]) % 52;
            const [c, r] = MAIN_PATH[idx];
            const [nx, ny] = this.getCellPixel(c, r);
            tv.px = nx;
            tv.py = ny;
          } else {
            const homeStep = tv.steps - effectiveLapEnd;
            const hIdx = Math.min(5, homeStep - 1); // FIX: 0-indexed
            const [c, r] = HOME_STRETCHES[p][hIdx];
            const [nx, ny] = this.getCellPixel(c, r);
            tv.px = nx;
            tv.py = ny;
          }
        }
      }
    }
    this.updateTokenStacking();
  }

  syncTimer(data) {
    this.currentPlayer = data.player;
    this.turnDuration = data.duration;
    this.turnEndsAt = data.endsAt;
    if (data.endsAt < Date.now()) {
      this.turnEndsAt = Date.now() + data.duration;
    }
  }

  playRemoteDiceRoll(val, player, rollId = 0) {
    if (rollId && rollId <= this.lastDiceRollId) return;
    if (rollId) this.lastDiceRollId = rollId;

    this.currentPlayer = player;

    // If already rolling, update the final value so the current animation ends correctly
    // But we should also ensure the rollQueue doesn't get desynced if multiple rolls happen
    this.dice.value = val;

    if (!this.dice.rolling) {
      this.dice.roll(val);
      this.audio.playDiceRoll();
    }

    if (this.pendingDiceRollTimer) clearTimeout(this.pendingDiceRollTimer);
    this.pendingDiceRollTimer = setTimeout(() => {
      this.pendingDiceRollTimer = null;
    }, 700);
  }

  playRemoteTokenMove(player, index, toSteps, finishedInHome, lapCount) {
    const token = this.tokens[player][index];
    const fromSteps = token.steps;
    if (finishedInHome) token.inHome = false;

    if (lapCount !== undefined) {
      token.lapCount = lapCount;
    }

    token.steps = toSteps;
    this.moveTokenSequentially(token, fromSteps, toSteps);
    this.audio.playMove();

    const delay = Math.abs(toSteps - fromSteps) * 120 + 80;
    setTimeout(() => {
      this.updateTokenStacking();
    }, delay);
  }

  playKills(killedList) {
    killedList.forEach((k) => {
      const t = this.tokens[k.player][k.index];
      this.sendTokenHome(t);
      this.spawnParticles(t.px, t.py, COLORS.RED, 20);
    });
    if (killedList.length > 0) {
      this.audio.playKill();
    }
  }

  showWinner(winnerIndex) {
    this.winner = winnerIndex;
    this.gameState = "end";
    this.audio.playWin();
  }

  showPlayerReconnected(playerColor, playerName) {
    // Show a notification that the player has reconnected
    this.showAvatarMessage(playerColor, "Back!");
    // Could also add a system message or toast notification here
    console.log(`${playerName} has reconnected to the game`);
  }

  updatePeerVoiceStatus(sessionId, color, isMicOn) {
    if (color >= 0 && color < 4 && this.avatars[color]) {
      this.avatars[color].micOn = isMicOn;
    }
  }

  // FIX: syncJunctionChoice — stepsRemaining bhi pass karo
  syncJunctionChoice(player, tokenIndex, remaining, atStep) {
    if (this.network && this.network.playerColor !== player) return;

    const token = this.tokens[player][tokenIndex];

    const homeCell = HOME_STRETCHES[player][0];
    const [hbx, hby] = this.getCellPixel(homeCell[0], homeCell[1]);
    const homeScreenPt = this.boardToScreen(hbx, hby);

    const nextLapIdx = (atStep + PLAYER_START_INDICES[player]) % 52;
    const lapCell = MAIN_PATH[nextLapIdx];
    const [lbx, lby] = this.getCellPixel(lapCell[0], lapCell[1]);
    const lapScreenPt = this.boardToScreen(lbx, lby);

    const tokenScreenPt = this.boardToScreen(token.px, token.py);

    // FIX: stepsRemaining pass karo
    this.junctionArrows.show(
      { px: tokenScreenPt[0], py: tokenScreenPt[1] },
      homeScreenPt,
      lapScreenPt,
      remaining, // was missing before
    );
    token.decisionPending = true;
    this.pendingMove = { token, stepsRemaining: remaining };
    this.gameState = "junction";
  }

  isEmojiMessage(text) {
    const value = String(text || "").trim();
    if (!value || value.length > 6) return false;
    return /\p{Extended_Pictographic}/u.test(value);
  }

  showAvatarMessage(senderRef, text) {
    const message = String(text || "").trim();
    if (!message) return;

    const numericSender = Number(senderRef);
    const avatarIndex = Number.isInteger(numericSender)
      ? numericSender
      : PLAYER_NAMES.findIndex((n) => n === senderRef);
    if (avatarIndex < 0 || !this.avatars[avatarIndex]) return;

    if (this.isEmojiMessage(message)) {
      this.avatars[avatarIndex].setEmoji(message, 120);
      return;
    }
    this.avatars[avatarIndex].setMessage(message, 240);
  }
}
