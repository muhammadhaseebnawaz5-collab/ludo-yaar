import { COLORS, PLAYER_COLORS, PLAYER_LIGHT, HOME_POSITIONS, BOARD_X, BOARD_Y, CELL, SCREEN_W, MAIN_PATH, HOME_STRETCHES } from './constants.js';


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
            
            // Speed of hop depends on frame rate, complete hop in ~10-15 frames
            this.hopProgress += 0.08; 
            
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

        // Hop scaling effect (scales up to 1.25x exactly halfway through hop)
        if (this.animating && this.hopProgress > 0) {
            const hopArc = Math.sin(this.hopProgress * Math.PI);
            scale = 1 + (hopArc * 0.25);
            y -= hopArc * 8; // Slight physical "jump" upwards in Y
        }
        
        const r = baseRadius * scale;

        ctx.save();
        ctx.translate(x, y);

        // ══════════════════════════════════════════
        // TOKEN GLOW SYSTEM (Canvas-based)
        // ══════════════════════════════════════════
        if (this.isCurrentPlayer && !this.finished) {
            if (this.isMoveable) {
                // GOLDEN INTENSE GLOW — chal sakta hai
                const pulseScale = 1 + Math.sin(this.pulse * 2) * 0.12; // fast bounce
                const glowR = r * 1.6 * pulseScale;
                
                // Outer golden halo (multiple layers for intensity)
                [0.18, 0.28, 0.42].forEach((alpha, i) => {
                    const layerR = glowR * (1 + i * 0.3);
                    ctx.beginPath();
                    ctx.arc(0, 0, layerR, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(253, 224, 71, ${alpha})`;
                    ctx.fill();
                });

                // Bounce — token thoda upar jaata hai
                const bounce = Math.sin(this.pulse * 2) * 5;
                ctx.translate(0, -bounce);

            } else if (this.inHome) {
                // HOME TOKEN — blue idle glow (hamesha)
                const pulseAlpha = 0.25 + Math.sin(this.pulse) * 0.12;
                [1.5, 2.0, 2.6].forEach((mult, i) => {
                    ctx.beginPath();
                    ctx.arc(0, 0, r * mult, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(96, 165, 250, ${pulseAlpha / (i + 1)})`;
                    ctx.fill();
                });
                
                // Slow float (token thoda hilta hai)
                const floatY = Math.sin(this.pulse * 0.6) * 3;
                ctx.translate(0, -floatY);

            } else {
                // BOARD TOKEN — blue idle glow (hamesha current player ke)
                const pulseAlpha = 0.2 + Math.sin(this.pulse) * 0.1;
                [1.4, 1.9, 2.5].forEach((mult, i) => {
                    ctx.beginPath();
                    ctx.arc(0, 0, r * mult, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(96, 165, 250, ${pulseAlpha / (i + 1)})`;
                    ctx.fill();
                });
            }
            
            // Ring pulse effect (expanding ring)
            const ringProgress = (this.pulse % (Math.PI * 2)) / (Math.PI * 2);
            const ringR = r * 1.2 + ringProgress * r * 2.5;
            const ringAlpha = Math.max(0, 0.6 - ringProgress * 0.6);
            ctx.strokeStyle = this.isMoveable 
                ? `rgba(251, 191, 36, ${ringAlpha})` 
                : `rgba(96, 165, 250, ${ringAlpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.stroke();

        } else if (!this.isCurrentPlayer) {
            // DOOSRE PLAYER — dim kar do
            ctx.globalAlpha = 0.3;
        }
        // ══════════════════════════════════════════

        // 1. Drop Shadow for overall piece
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4 * scale;
        ctx.shadowOffsetY = 2 * scale;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Outer Ring (Metallic Gold / Light Yellow) with Inner Arc Glow
        const ringGrad = ctx.createLinearGradient(-r, -r, r, r);
        ringGrad.addColorStop(0, '#FFF59D'); // Light rim top
        ringGrad.addColorStop(0.5, '#FBC02D'); // Gold body
        ringGrad.addColorStop(1, '#F57F17'); // Dark rim bottom

        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Base Color (Radial Gradient for 3D Convex look)
        const innerR = r * 0.82;
        const color = PLAYER_COLORS[this.player];
        const colorLight = PLAYER_LIGHT[this.player];
        
        const baseGrad = ctx.createRadialGradient(-innerR*0.2, -innerR*0.2, 0, 0, 0, innerR);
        baseGrad.addColorStop(0, colorLight);
        baseGrad.addColorStop(0.7, color);
        baseGrad.addColorStop(1, '#00000033'); // Darken edges

        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.arc(0, 0, innerR, 0, Math.PI * 2);
        ctx.fill();

        // 3. Crown Icon (White with black 20% shadow)
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 2 * scale;
        ctx.shadowOffsetY = 1 * scale;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.floor(r * 1.2)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("♔", 0, 0);
        ctx.shadowColor = 'transparent';

        // 4. Glossy Overlay (Crescent on top-left)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, innerR, Math.PI, Math.PI * 1.5);
        ctx.arc(innerR * 0.2, innerR * 0.2, innerR, Math.PI * 1.5, Math.PI, true);
        ctx.fill();

        // Selection / Decision Hover glow
        if (this.selected || this.decisionPending) {
            const pulseR = r + 4 + Math.sin(this.pulse) * 3;
            ctx.strokeStyle = this.decisionPending ? 'rgba(255,215,0,0.8)' : 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, pulseR, 0, Math.PI*2);
            ctx.stroke();
        }

        ctx.restore();
    }
}


export class ChatSystem {
    constructor() {
        this.messages = [
            { sender: "Govind", text: "Let's play!", color: COLORS.GREEN },
            { sender: "Sachin Kumar Sh", text: "Ready!", color: COLORS.YELLOW }
        ];
        this.inputText = "";
        this.active = false;
        this.visible = false;
    }

    addMessage(sender, text, color) {
        this.messages.push({ sender, text, color });
        if (this.messages.length > 20) this.messages.shift();
    }

    draw(ctx, x, y, w, h) {
        if (!this.visible) return;

        // Chat panel
        ctx.fillStyle = 'rgba(30, 15, 40, 0.86)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10);
        ctx.fill();
        ctx.strokeStyle = COLORS.PURPLE;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Messages
        ctx.font = "bold 12px Arial";
        let msgY = y + 25;
        this.messages.slice(-6).forEach(m => {
            ctx.fillStyle = m.color;
            ctx.fillText(`${m.sender}:`, x + 10, msgY);
            ctx.fillStyle = COLORS.WHITE;
            ctx.fillText(m.text, x + 10, msgY + 14);
            msgY += 30;
        });

        // Input box
        const inputRect = { x: x + 5, y: y + h - 28, w: w - 10, h: 22 };
        ctx.fillStyle = COLORS.WHITE;
        ctx.beginPath();
        ctx.roundRect(inputRect.x, inputRect.y, inputRect.w, inputRect.h, 5);
        ctx.fill();
        ctx.strokeStyle = COLORS.PURPLE;
        ctx.stroke();

        ctx.fillStyle = COLORS.BLACK;
        ctx.fillText(this.inputText + (this.active && Math.floor(Date.now() / 500) % 2 === 0 ? "|" : ""), inputRect.x + 5, inputRect.y + 15);
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
    }

    update() {
        this.pulse += 0.05;
        if (this.speakTimer > 0) {
            this.speakTimer--;
            this.speaking = true;
        } else {
            this.speaking = false;
        }
    }

    draw(ctx) {
        const [x, y] = this.position;
        const r = this.size / 2;

        // Active glow
        if (this.active) {
            for (let i = 5; i > 0; i--) {
                ctx.fillStyle = `${this.color}${Math.floor((50 - i * 8) / 255 * 100).toString(16).padStart(2, '0')}`;
                ctx.beginPath();
                ctx.arc(x, y, r + i * 3, 0, Math.PI * 2);
                ctx.fill();
            }
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
        ctx.strokeStyle = this.active ? COLORS.WHITE : COLORS.GOLD;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Speaking animation
        if (this.speaking) {
            for (let i = 0; i < 3; i++) {
                const pulseR = r + 5 + i * 6 + Math.sin(this.pulse * 3 + i) * 3;
                ctx.strokeStyle = `rgba(100, 255, 100, ${Math.max(0, 0.6 - i * 0.2)})`;
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
        ctx.fillStyle = 'rgba(10,5,20,0.8)';
        ctx.beginPath(); ctx.arc(spkX, spkY, 10, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.moveTo(spkX - 2, spkY - 2); ctx.lineTo(spkX, spkY - 2);
        ctx.lineTo(spkX + 2, spkY - 4); ctx.lineTo(spkX + 2, spkY + 4);
        ctx.lineTo(spkX, spkY + 2); ctx.lineTo(spkX - 2, spkY + 2);
        ctx.closePath(); ctx.fill();

        if (!this.micOn) {
            ctx.strokeStyle = '#FF3333';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(spkX - 5, spkY - 5); ctx.lineTo(spkX + 5, spkY + 5); ctx.stroke();
        } else {
            ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(spkX + 1, spkY, 3, -Math.PI/4, Math.PI/4); ctx.stroke();
            if (this.speaking) {
                ctx.beginPath(); ctx.arc(spkX + 1, spkY, 6, -Math.PI/4, Math.PI/4); ctx.stroke();
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

        const x = sx;
        const y = sy - 60;
        const w = this.options.length * 50;

        ctx.fillStyle = 'rgba(40, 20, 60, 0.95)';
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
        if (!this.activeToken) return null;
        const x = sx;
        const y = sy - 60;
        const w = this.options.length * 50;

        for (let i = 0; i < this.options.length; i++) {
            const bx = x - w / 2 + 25 + i * 50;
            const by = y + 20;
            if (Math.hypot(sx - bx, sy - by) < 18) {
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
        this.drawConnectingLine(ctx, this.activeToken.px, this.activeToken.py, this.homePos, '#FFD700');
        this.drawConnectingLine(ctx, this.activeToken.px, this.activeToken.py, this.lapPos, '#00E5FF');

        // Draw HOME button
        this.drawChoiceBox(ctx, this.homePos, 'home');

        // Draw LAP button  
        this.drawChoiceBox(ctx, this.lapPos, 'lap');

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
        const [x, y] = pos;
        const isHome = type === 'home';
        const w = 90, h = 52;
        const bx = x - w / 2;
        const by = y - h / 2;

        const pulse = Math.sin(this.pulse * (isHome ? 1.2 : 1.5)) * 0.15;
        const scale = 1 + pulse;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);

        // Shadow
        ctx.shadowColor = isHome ? 'rgba(255, 215, 0, 0.6)' : 'rgba(0, 229, 255, 0.6)';
        ctx.shadowBlur = 16 + Math.sin(this.pulse) * 6;

        // Box background
        const grad = ctx.createLinearGradient(bx, by, bx, by + h);
        if (isHome) {
            grad.addColorStop(0, '#7B3F00');
            grad.addColorStop(0.5, '#4A2200');
            grad.addColorStop(1, '#2D1500');
        } else {
            grad.addColorStop(0, '#003366');
            grad.addColorStop(0.5, '#001A3A');
            grad.addColorStop(1, '#000D1F');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx, by, w, h, 12);
        ctx.fill();

        // Border
        ctx.strokeStyle = isHome ? '#FFD700' : '#00E5FF';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Icon
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isHome ? '🏠' : '🔄', x, y - 8);

        // Label
        ctx.fillStyle = isHome ? '#FFD700' : '#00E5FF';
        ctx.font = 'bold 11px Arial';
        ctx.fillText(isHome ? 'HOME' : 'LAP', x, y + 10);

        // Steps hint
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '9px Arial';
        ctx.fillText(`+${this.stepsRemaining} steps`, x, y + 22);

        ctx.restore();
    }

    drawQuestionBubble(ctx) {
        if (!this.activeToken) return;
        const tx = this.activeToken.px;
        const ty = this.activeToken.py - 55;
        const w = 140, h = 34;

        const bounce = Math.sin(this.pulse * 1.5) * 3;

        ctx.save();
        ctx.translate(0, bounce);

        // Bubble background
        ctx.fillStyle = 'rgba(20, 10, 40, 0.92)';
        ctx.beginPath();
        ctx.roundRect(tx - w / 2, ty - h / 2, w, h, 10);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Tail
        ctx.fillStyle = 'rgba(20, 10, 40, 0.92)';
        ctx.beginPath();
        ctx.moveTo(tx - 8, ty + h / 2);
        ctx.lineTo(tx, ty + h / 2 + 10);
        ctx.lineTo(tx + 8, ty + h / 2);
        ctx.closePath();
        ctx.fill();

        // Text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Kahan jaana hai?', tx, ty);

        ctx.restore();
    }

    handleClick(sx, sy) {
        if (!this.visible || !this.activeToken) return null;
        const w = 90, h = 52;

        const [hx, hy] = this.homePos;
        if (sx >= hx - w/2 && sx <= hx + w/2 && sy >= hy - h/2 && sy <= hy + h/2) {
            return 'home';
        }

        const [lx, ly] = this.lapPos;
        if (sx >= lx - w/2 && sx <= lx + w/2 && sy >= ly - h/2 && sy <= ly + h/2) {
            return 'lap';
        }

        return null;
    }
}

export class SynthesizedAudioManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    beep(freq, duration, vol = 0.1, type = 'sine') {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playDiceRoll() {
        this.init();
        this.beep(200, 0.1, 0.05, 'square');
    }

    playMove() {
        this.init();
        this.beep(600, 0.1, 0.05);
    }

    playKill() {
        this.init();
        this.beep(150, 0.4, 0.1, 'sawtooth');
    }

    playWin() {
        this.init();
        this.beep(800, 0.5, 0.1);
        setTimeout(() => this.beep(1000, 0.5, 0.1), 100);
    }
}

