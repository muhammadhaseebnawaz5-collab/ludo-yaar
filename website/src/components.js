import {
  COLORS,
  PLAYER_COLORS,
  PLAYER_LIGHT,
  HOME_POSITIONS,
  BOARD_X,
  BOARD_Y,
  CELL,
  SCREEN_W,
  SCREEN_H,
  MAIN_PATH,
  HOME_STRETCHES,
} from "./constants.js";

export class DiceAnimation {
  constructor() {
    this.value = 1;
    this.rolling = false;
    this.rollFrames = 0;
    this.rollMax = 20;
    this.displayValue = 1;
    this.angle = 0;
  }

  roll(val = null) {
    this.rolling = true;
    this.rollFrames = 0;
    this.value = val || Math.floor(Math.random() * 6) + 1;
  }

  update() {
    if (this.rolling) {
      this.rollFrames++;
      this.displayValue = Math.floor(Math.random() * 6) + 1;
      this.angle += 15;
      if (this.rollFrames >= this.rollMax) {
        this.rolling = false;
        this.displayValue = this.value;
        this.angle = 0;
      }
    }
  }

  // draw() was removed because LudoGame uses its own draw3DDice method for rendering.
}

export class Token {
  constructor(player, index, initialPos) {
    this.player = player;
    this.index = index;
    this.gridPos = initialPos;
    this.steps = 0;
    this.finished = false;
    this.inHome = true;
    this.px = 0;
    this.py = 0;
    this.animating = false;
    this.moveQueue = [];
    this.selected = false;
    this.pulse = 0;
    this.offset = { x: 0, y: 0 };
    this.lapCount = 0;
    this.decisionPending = false;

    this.hopProgress = 0;
    this.startPx = 0;
    this.startPy = 0;

    this.isCurrentPlayer = false;
    this.isMoveable = false;
  }

  update() {
    this.pulse += 0.1;
    if (this.moveQueue.length > 0) {
      if (!this.animating) {
        this.animating = true;
        this.startPx = this.px;
        this.startPy = this.py;
        this.hopProgress = 0;
      }

      const target = this.moveQueue[0];
      const dx = target[0] - this.startPx;
      const dy = target[1] - this.startPy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 🚀 FASTER MOVEMENT
      // Roll based dynamic speed: Roll 1-2 -> normal (~0.12), Roll 5-6 -> faster (~0.2)
      // Since we don't have the roll here easily, we'll just use a faster baseline
      // and maybe check if moveQueue is long.
      // 🚀 SLOWER & SMOOTHER MOVEMENT
      const speed = this.moveQueue.length > 3 ? 0.16 : 0.12;
      this.hopProgress += speed;

      if (this.hopProgress >= 1) {
        this.px = target[0];
        this.py = target[1];
        this.moveQueue.shift();
        this.animating = false;
        this.hopProgress = 0;
      } else {
        this.px = this.startPx + dx * this.hopProgress;
        this.py = this.startPy + dy * this.hopProgress;
      }
    }
  }

  draw(ctx, baseRadius = 14) {
    let x = this.px + this.offset.x;
    let y = this.py + this.offset.y;
    let scale = 1;
    let activePulse = 0;


    // Smooth hop scaling effect during movement
    if (this.animating && this.hopProgress > 0) {
      const hopArc = Math.sin(this.hopProgress * Math.PI);
      scale = 1 + hopArc * 0.15; // Reduced from 0.25
      y -= hopArc * 4; // Reduced from 8 for a calmer movement
    }


    const r = baseRadius * scale;

    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.translate(x, y);

    // ══════════════════════════════════════════
    // PREMIUM ACTIVE ANIMATION (Clean & Calm)
    // ══════════════════════════════════════════
    if (this.isCurrentPlayer && this.isMoveable && !this.finished && !this.animating) {
      // ══════════════════════════════════════════
      // PREMIUM ACTIVE ANIMATION (Matching User Screenshot)
      // ══════════════════════════════════════════
      activePulse = Math.sin(this.pulse * 0.8) * 0.5 + 0.5; // 0 to 1
      scale *= (1 + activePulse * 0.05);
      
      // Prominent White Outer Glow
      ctx.save();
      const glowGrad = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.8);
      glowGrad.addColorStop(0, "rgba(255, 255, 255, 0.4)"); // Higher opacity
      glowGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
      glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Inner pulsating white ring
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + activePulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // ══════════════════════════════════════════
    }
    // ══════════════════════════════════════════

    // Ensure full opacity for all tokens
    ctx.globalAlpha = 1.0;
    // ══════════════════════════════════════════

    // 1. Softer Drop Shadow for premium depth
    ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
    ctx.shadowBlur = 6 * scale;
    ctx.shadowOffsetY = 3 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;


    // Outer Ring (Refined Metallic look)
    const ringGrad = ctx.createLinearGradient(-r, -r, r, r);
    ringGrad.addColorStop(0, "#FEF9C3"); // Softer light rim
    ringGrad.addColorStop(0.5, "#FDE047"); // Muted Gold
    ringGrad.addColorStop(1, "#EAB308"); // Warm Gold bottom


    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Base Color (Radial Gradient for 3D Convex look)
    const innerR = r * 0.82;
    const color = PLAYER_COLORS[this.player];
    const colorLight = PLAYER_LIGHT[this.player];

    const baseGrad = ctx.createRadialGradient(
      -innerR * 0.2,
      -innerR * 0.2,
      0,
      0,
      0,
      innerR,
    );
    baseGrad.addColorStop(0, colorLight);
    baseGrad.addColorStop(0.8, color);
    baseGrad.addColorStop(1, "rgba(0, 0, 0, 0.12)"); // Very soft edge


    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.fill();

    // 3. Crown Icon (White with black 20% shadow)
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 2 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.floor(r * 1.2)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♔", 0, 0);
    ctx.shadowColor = "transparent";

    // 6. Glossy Overlay (Crescent on top-left)
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.beginPath();
    ctx.arc(0, 0, innerR, Math.PI, Math.PI * 1.5);
    ctx.arc(innerR * 0.1, innerR * 0.1, innerR, Math.PI * 1.5, Math.PI, true);
    ctx.fill();

    // 7. Subtle Shine for Finished Tokens
    if (this.finished) {
        const shinePos = (this.pulse * 0.5) % 8; // Cycle through
        if (shinePos < 2) {
            ctx.save();
            ctx.rotate(Math.PI / 4);
            const shineGrad = ctx.createLinearGradient(-r, 0, r, 0);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.25)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            const sx = -r + shinePos * r;
            ctx.fillRect(sx, -r, r * 0.4, r * 2);
            ctx.restore();
        }
    }

    ctx.restore();
  }
}

export class ChatSystem {
  constructor() {
    this.messages = [
      { sender: "Govind", text: "Let's play!", color: COLORS.GREEN },
      { sender: "Sachin Kumar Sh", text: "Ready!", color: COLORS.YELLOW },
    ];
    this.quickPhrases = [
      "Voice Chat?",
      "Well played",
      "Hi",
      "Hello",
      "Good luck",
      "Oops",
    ];
    this.quickEmojis = [
      "\u{1F602}",
      "\u{1F60D}",
      "\u{1F622}",
      "\u{1F44D}",
      "\u{1F525}",
    ];
    this.inputText = "";
    this.active = false;
    this.visible = false;
    this.layout = { x: 8, y: 110, w: 464, h: 510 };
    this.phraseRects = [];
    this.emojiRects = [];
  }

  addMessage(sender, text, color) {
    this.messages.push({ sender, text, color });
    if (this.messages.length > 20) this.messages.shift();
  }

  draw(ctx, x, y, w, h) {
    if (!this.visible) return;
    this.layout = { x, y, w, h };

    // Chat panel
    ctx.fillStyle = "rgba(20, 10, 30, 0.95)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h + 54, 14);
    ctx.fill();
    ctx.strokeStyle = COLORS.PURPLE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Messages header
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Chat", x + 12, y + 28);

    // Close button (top-right)
    const close = this.getCloseButtonRect();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.roundRect(close.x, close.y, close.w, close.h, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = COLORS.WHITE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(close.x + 8, close.y + 8);
    ctx.lineTo(close.x + close.w - 8, close.y + close.h - 8);
    ctx.moveTo(close.x + close.w - 8, close.y + 8);
    ctx.lineTo(close.x + 8, close.y + close.h - 8);
    ctx.stroke();

    // Message area and scrollbar
    const contentTop = y + 44;
    const contentHeight = 236;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.roundRect(x + 10, contentTop, w - 20, contentHeight, 10);
    ctx.fill();

    const maxVisible = Math.floor((contentHeight - 18) / 34);
    const visibleMessages = this.messages.slice(-maxVisible);
    const scrollNeeded = this.messages.length > maxVisible;
    let msgY = contentTop + 24;
    ctx.font = "bold 14px Arial";
    visibleMessages.forEach((m) => {
      ctx.fillStyle = m.color;
      ctx.fillText(`${m.sender}:`, x + 18, msgY);
      ctx.fillStyle = COLORS.WHITE;
      ctx.font = "14px Arial";
      ctx.fillText(m.text, x + 18, msgY + 19);
      msgY += 34;
      ctx.font = "bold 14px Arial";
    });

    if (scrollNeeded) {
      const trackX = x + w - 16;
      const trackY = contentTop + 8;
      const trackH = contentHeight - 16;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(trackX, trackY, 6, trackH);
      const thumbHeight = Math.max(
        24,
        (maxVisible / this.messages.length) * trackH,
      );
      const thumbY =
        trackY +
        ((this.messages.length - maxVisible) / this.messages.length) *
          (trackH - thumbHeight);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(trackX, thumbY, 6, thumbHeight);
    }

    // Emoji bar
    this.emojiRects = [];
    const emojiY = contentTop + contentHeight + 12;
    const emojiSize = 44;
    const emojiGap = 8;
    const emojiTotalW =
      this.quickEmojis.length * emojiSize +
      (this.quickEmojis.length - 1) * emojiGap;
    let emojiX = x + (w - emojiTotalW) / 2;
    this.quickEmojis.forEach((emoji) => {
      this.emojiRects.push({
        x: emojiX,
        y: emojiY,
        w: emojiSize,
        h: emojiSize,
        value: emoji,
      });
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.roundRect(emojiX, emojiY, emojiSize, emojiSize, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = "25px Arial";
      ctx.textAlign = "center";
      ctx.fillText(emoji, emojiX + emojiSize / 2, emojiY + 31);
      emojiX += emojiSize + emojiGap;
    });

    // Input box
    const inputRect = { x: x + 10, y: y + h + 10, w: w - 112, h: 42 };
    ctx.fillStyle = COLORS.WHITE;
    ctx.beginPath();
    ctx.roundRect(inputRect.x, inputRect.y, inputRect.w, inputRect.h, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Send Button
    const btnRect = { x: x + w - 92, y: y + h + 10, w: 82, h: 42 };
    ctx.fillStyle = COLORS.GREEN;
    ctx.beginPath();
    ctx.roundRect(btnRect.x, btnRect.y, btnRect.w, btnRect.h, 8);
    ctx.fill();
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText("SEND", btnRect.x + btnRect.w / 2, btnRect.y + 27);

    ctx.textAlign = "left";
    const inputValue = this.inputText;
    ctx.fillStyle = inputValue ? COLORS.BLACK : "rgba(0,0,0,0.42)";
    ctx.font = "14px Arial";
    ctx.fillText(
      (inputValue || "Tap here to type...") +
        (this.active && Math.floor(Date.now() / 500) % 2 === 0 ? "|" : ""),
      inputRect.x + 10,
      inputRect.y + 27,
    );
  }

  getCloseButtonRect() {
    const { x, y, w } = this.layout;
    return { x: x + w - 34, y: y + 8, w: 24, h: 24 };
  }

  getSendButtonRect() {
    const { x, y, w, h } = this.layout;
    return { x: x + w - 92, y: y + h + 10, w: 82, h: 42 };
  }

  getInputRect() {
    const { x, y, w, h } = this.layout;
    return { x: x + 10, y: y + h + 10, w: w - 112, h: 42 };
  }

  getQuickActionAt(px, py) {
    const emoji = this.emojiRects.find(
      (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h,
    );
    return emoji ? emoji.value : null;
  }

  containsPoint(px, py) {
    const { x, y, w, h } = this.layout;
    const panelBottom = y + h + 56;
    return px >= x && px <= x + w && py >= y && py <= panelBottom;
  }
}

export class ProfileAvatar {
  constructor(name, color, position, size = 50) {
    this.name = name;
    this.color = color;
    this.position = position;
    this.size = size;
    this.pulse = 0;
    this.active = false;
    this.initials = name.substring(0, 2).toUpperCase();
    this.speaking = false;
    this.speakTimer = 0;
    this.micOn = false; // Is their mic enabled?
    this.timerPercent = 0; // 0 to 1 for the green turn timer ring
    this.botEnabled = false;
    this.isOnline = true; // Is the player online?
    this.displayEmoji = null;
    this.emojiTimer = 0;
    this.emojiAnimationApplied = false;
    this.displayMessage = "";
    this.messageTimer = 0;
    this.messageAnimationApplied = false;
    this.left = false; // Player has permanently left the game


    // Absolute layer tracks avatar on screen; inner container stays relative for overlays.
    this.avatarLayer = document.createElement("div");
    this.avatarLayer.style.position = "absolute";
    this.avatarLayer.style.left = `${position[0] - size / 2}px`;
    this.avatarLayer.style.top = `${position[1] - size / 2}px`;
    this.avatarLayer.style.width = `${size}px`;
    this.avatarLayer.style.height = `${size}px`;
    this.avatarLayer.style.pointerEvents = "none";
    this.avatarLayer.style.zIndex = "10000";
    document.querySelector(".game-container").appendChild(this.avatarLayer);

    this.avatarContainer = document.createElement("div");
    this.avatarContainer.className = "avatar-container";
    this.avatarContainer.style.width = "100%";
    this.avatarContainer.style.height = "100%";
    this.avatarLayer.appendChild(this.avatarContainer);

    this.emojiElement = document.createElement("div");
    this.emojiElement.className = "avatar-emoji-popup";
    this.emojiElement.style.position = "absolute";
    this.emojiElement.style.display = "none";
    this.emojiElement.style.pointerEvents = "none";
    this.emojiElement.style.zIndex = "10001";
    this.avatarContainer.appendChild(this.emojiElement);

    this.messageElement = document.createElement("div");
    this.messageElement.className = "avatar-message-popup";
    this.messageElement.style.display = "none";
    this.messageElement.style.pointerEvents = "none";
    this.avatarContainer.appendChild(this.messageElement);
  }

  update() {
    this.pulse += 0.05;
    if (this.speakTimer > 0) {
      this.speakTimer--;
      this.speaking = true;
    } else {
      this.speaking = this.micOn;
    }
    if (this.emojiTimer > 0) {
      this.emojiTimer--;
      if (this.displayEmoji && this.emojiTimer > 0) {
        this.updatePopupPlacement(this.emojiElement, "emoji");
        this.emojiElement.style.display = "flex";
        this.emojiElement.textContent = this.displayEmoji;
        this.emojiElement.classList.add("show");
        // Add bounce animation only once when emoji appears
        if (!this.emojiAnimationApplied) {
          this.emojiElement.style.animation = "emoji-bounce 0.6s ease-out";
          this.emojiAnimationApplied = true;
        }
      } else {
        this.emojiElement.classList.remove("show");
        this.emojiElement.style.opacity = "0";
        setTimeout(() => {
          if (this.emojiTimer <= 0) this.emojiElement.style.display = "none";
        }, 180);
        this.emojiElement.style.animation = "";
        this.emojiAnimationApplied = false;
      }
    }

    if (this.messageTimer > 0) {
      this.updatePopupPlacement(this.messageElement, "message");
      this.messageTimer--;
      this.messageElement.style.display = "block";
      this.messageElement.textContent = this.displayMessage;
      this.messageElement.classList.add("show");
      // Add bounce animation only once when message appears
      if (!this.messageAnimationApplied) {
        this.messageElement.style.animation = "message-bounce 0.6s ease-out";
        this.messageAnimationApplied = true;
      }
      if (this.messageTimer <= 18) {
        this.messageElement.classList.remove("show");
      }
    } else {
      this.messageElement.style.display = "none";
      this.messageElement.classList.remove("show");
      this.messageElement.style.animation = "";
      this.messageAnimationApplied = false;
    }
  }

  setEmoji(emoji, duration = 120) {
    this.displayEmoji = emoji;
    this.emojiTimer = duration;
    this.emojiAnimationApplied = false;
    this.emojiElement.style.opacity = "1";
    this.emojiElement.classList.remove("show");
  }

  setMessage(message, duration = 240) {
    this.displayMessage = String(message || "").trim();
    this.messageTimer = duration;
    this.messageAnimationApplied = false;
  }

  setPosition(x, y) {
    this.position = [x, y];

    const canvas = document.getElementById("gameCanvas");
    const gameContainer = document.querySelector(".game-container");

    if (canvas && gameContainer) {
      const canvasRect = canvas.getBoundingClientRect();
      const containerRect = gameContainer.getBoundingClientRect();
      const scale = canvasRect.width / SCREEN_W;
      const offsetX = canvasRect.left - containerRect.left;
      const offsetY = canvasRect.top - containerRect.top;

      this.avatarLayer.style.left = `${offsetX + x * scale - this.size / 2}px`;
      this.avatarLayer.style.top = `${offsetY + y * scale - this.size / 2}px`;
    } else {
      this.avatarLayer.style.left = `${x - this.size / 2}px`;
      this.avatarLayer.style.top = `${y - this.size / 2}px`;
    }

    this.updatePopupPlacement(this.emojiElement, "emoji");
    this.updatePopupPlacement(this.messageElement, "message");
  }

  updatePopupPlacement(element, type) {
    if (!element) return;

    const [x, y] = this.position;
    const safe = 20;
    const popupW = type === "emoji" ? 72 : 240;
    const popupH = type === "emoji" ? 64 : 84;
    const gap = 12;
    const minCenterX = safe + popupW / 2;
    const maxCenterX = SCREEN_W - safe - popupW / 2;
    const centerX = Math.min(Math.max(x, minCenterX), maxCenterX);

    const belowTop = y + this.size / 2 + gap;
    const aboveTop = y - this.size / 2 - gap - popupH;
    let top = y < SCREEN_H / 2 ? belowTop : aboveTop;
    if (aboveTop < safe) top = belowTop;
    if (top + popupH > SCREEN_H - safe) top = Math.max(safe, aboveTop);
    top = Math.min(Math.max(top, safe), SCREEN_H - safe - popupH);

    const layerLeft = x - this.size / 2;
    const layerTop = y - this.size / 2;
    element.style.left = `${centerX - layerLeft}px`;
    element.style.top = `${top - layerTop}px`;
    element.style.bottom = "auto";
    element.style.transform = "translateX(-50%)";
  }

  draw(ctx) {
    const [x, y] = this.position;
    const r = this.size / 2;

    if (this.left) {
        // Grayed out state for LEFT players
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "#888";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("LEFT", x, y);
        
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
    }

    // Outer border (if active or mic on)
    if (this.active || this.micOn) {
       ctx.beginPath();
       ctx.arc(x, y, r + 4, 0, Math.PI * 2);
       ctx.strokeStyle = this.micOn ? "rgba(76, 175, 80, 0.4)" : "rgba(255, 255, 255, 0.2)";
       ctx.lineWidth = 2;
       ctx.stroke();
    }

    // Avatar background
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Initials
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.initials, x, y);

    // Border ring
    ctx.strokeStyle = this.micOn
      ? "#4CAF50"
      : this.active
        ? COLORS.WHITE
        : COLORS.GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Mic pulse ring animation
    if (this.micOn) {
      for (let i = 0; i < 3; i++) {
        const pulseR = r + 7 + i * 6 + Math.sin(this.pulse * 2 + i) * 2;
        ctx.strokeStyle = `rgba(76, 175, 80, ${Math.max(0, 0.45 - i * 0.12)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Name label
    ctx.fillStyle = COLORS.WHITE;
    ctx.font = "bold 12px Arial";
    ctx.fillText(this.name.substring(0, 14), x, y + r + 15);

    // Speaker / Mic Status Icon (bottom right of avatar)
    const spkX = x + r - 4;
    const spkY = y + r - 4;
    if (this.micOn) {
      ctx.strokeStyle = "rgba(76, 175, 80, 0.65)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(spkX, spkY, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = this.micOn ? "#4CAF50" : "rgba(10,5,20,0.8)";
    ctx.beginPath();
    ctx.arc(spkX, spkY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.micOn
      ? "rgba(255,255,255,0.5)"
      : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#FFF";
    ctx.beginPath();
    ctx.moveTo(spkX - 2, spkY - 2);
    ctx.lineTo(spkX, spkY - 2);
    ctx.lineTo(spkX + 2, spkY - 4);
    ctx.lineTo(spkX + 2, spkY + 4);
    ctx.lineTo(spkX, spkY + 2);
    ctx.lineTo(spkX - 2, spkY + 2);
    ctx.closePath();
    ctx.fill();

    if (!this.micOn) {
      ctx.strokeStyle = "#FF3333";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(spkX - 5, spkY - 5);
      ctx.lineTo(spkX + 5, spkY + 5);
      ctx.stroke();
    } else {
      // Mic is ON
      ctx.strokeStyle = "#FFF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(spkX + 1, spkY, 3, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
      if (this.speaking) {
        ctx.beginPath();
        ctx.arc(spkX + 1, spkY, 6, -Math.PI / 4, Math.PI / 4);
        ctx.stroke();
      }
    }
  }
}

// AudioControl class was removed as it was unused in the current implementation.

export class MoveSelectionOverlay {
  constructor() {
    this.activeToken = null;
    this.options = [];
    this.buttonSize = 40;
    this.lastAnchor = null;
  }

  show(token, options) {
    this.activeToken = token;
    this.options = options;
  }

  hide() {
    this.activeToken = null;
  }

  draw(ctx, sx, sy) {
    if (!this.activeToken) return;
    this.lastAnchor = { sx, sy };

    ctx.save();
    ctx.globalAlpha = 1.0;

    const x = sx;
    const y = sy - 60;
    const w = this.options.length * 50;

    ctx.fillStyle = "rgba(40, 20, 60, 0.95)";
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 10, w, 60, 10);
    ctx.fill();
    ctx.strokeStyle = COLORS.GOLD;
    ctx.stroke();

    this.options.forEach((val, i) => {
      const bx = x - w / 2 + 25 + i * 50;
      const by = y + 20;

      ctx.fillStyle = COLORS.WHITE;
      ctx.beginPath();
      ctx.arc(bx, by, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.PURPLE;
      ctx.stroke();

      ctx.fillStyle = COLORS.BLACK;
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`+${val}`, bx, by + 6);
    });
  }

  handleClick(mx, my, sx, sy) {
    if (!this.activeToken || !this.lastAnchor) return null;

    const x = this.lastAnchor.sx;
    const y = this.lastAnchor.sy - 60;
    const w = this.options.length * 50;

    for (let i = 0; i < this.options.length; i++) {
      const bx = x - w / 2 + 25 + i * 50;
      const by = y + 20;
      // Increased hit area slightly (from 18 to 22) for better touch responsiveness
      if (Math.hypot(sx - bx, sy - by) < 22) {
        return this.options[i];
      }
    }
    return null;
  }
}

export class JunctionArrows {
  constructor() {
    this.activeToken = null;
    this.homePos = null;
    this.lapPos = null;
    this.stepsRemaining = 0;
    this.pulse = 0;
    this.visible = false;
  }

  show(token, homePos, lapPos, stepsRemaining) {
    this.activeToken = token;
    this.homePos = homePos;
    this.lapPos = lapPos;
    this.stepsRemaining = stepsRemaining;
    this.visible = true;
    this.pulse = 0;
  }

  hide() {
    this.activeToken = null;
    this.visible = false;
  }

  update() {
    if (this.visible) this.pulse += 0.08;
  }

  draw(ctx) {
    if (!this.visible || !this.activeToken) return;

    // Draw connecting lines from token to each option
    this.drawConnectingLine(
      ctx,
      this.activeToken.px,
      this.activeToken.py,
      this.homePos,
      "#FFD700",
    );
    this.drawConnectingLine(
      ctx,
      this.activeToken.px,
      this.activeToken.py,
      this.lapPos,
      "#00E5FF",
    );

    // Draw HOME button
    this.drawChoiceBox(ctx, this.homePos, "home");

    // Draw LAP button
    this.drawChoiceBox(ctx, this.lapPos, "lap");

    // Draw question bubble above token
    this.drawQuestionBubble(ctx);
  }

  drawConnectingLine(ctx, x1, y1, pos, color) {
    const [x2, y2] = pos;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6 + Math.sin(this.pulse) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawChoiceBox(ctx, pos, type) {
    if (!this.activeToken) return;
    const [x, y] = pos;
    const tx = this.activeToken.px;
    const ty = this.activeToken.py;
    const isHome = type === "home";

    const angle = Math.atan2(y - ty, x - tx);
    const pulse = Math.sin(this.pulse * (isHome ? 1.2 : 1.5)) * 0.15;
    const scale = 1.2 + pulse;

    ctx.save();
    ctx.translate(x, y);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.rotate(angle);

    ctx.shadowColor = isHome
      ? "rgba(255, 215, 0, 0.8)"
      : "rgba(0, 229, 255, 0.8)";
    ctx.shadowBlur = 12 + Math.sin(this.pulse) * 4;

    ctx.fillStyle = isHome ? "#FFD700" : "#00E5FF";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, 16);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-12, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isHome ? "#FFD700" : "#00E5FF";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(isHome ? "HOME" : "LAP", 0, 30);
    ctx.fillText(isHome ? "HOME" : "LAP", 0, 30);

    ctx.restore();
  }

  drawQuestionBubble(ctx) {
    if (!this.activeToken) return;
    const tx = this.activeToken.px;
    const ty = this.activeToken.py - 55;
    const w = 140,
      h = 34;

    const bounce = Math.sin(this.pulse * 1.5) * 3;

    ctx.save();
    ctx.translate(0, bounce);

    // Bubble background
    ctx.fillStyle = "rgba(20, 10, 40, 0.92)";
    ctx.beginPath();
    ctx.roundRect(tx - w / 2, ty - h / 2, w, h, 10);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tail
    ctx.fillStyle = "rgba(20, 10, 40, 0.92)";
    ctx.beginPath();
    ctx.moveTo(tx - 8, ty + h / 2);
    ctx.lineTo(tx, ty + h / 2 + 10);
    ctx.lineTo(tx + 8, ty + h / 2);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Kahan jaana hai?", tx, ty);

    ctx.restore();
  }

  handleClick(sx, sy) {
    if (!this.visible || !this.activeToken) return null;

    const [hx, hy] = this.homePos;
    if (Math.hypot(sx - hx, sy - hy) < 35) {
      return "home";
    }

    const [lx, ly] = this.lapPos;
    if (Math.hypot(sx - lx, sy - ly) < 35) {
      return "lap";
    }

    return null;
  }
}

export class SynthesizedAudioManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  beep(freq, duration, vol = 0.1, type = "sine") {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playDiceRoll() {
    this.init();
    this.beep(200, 0.1, 0.05, "square");
  }

  playMove() {
    this.init();
    this.beep(600, 0.1, 0.05);
  }

  playKill() {
    this.init();
    this.beep(150, 0.4, 0.1, "sawtooth");
  }

  playWin() {
    this.init();
    this.beep(800, 0.5, 0.1);
    setTimeout(() => this.beep(1000, 0.5, 0.1), 100);
  }
}
