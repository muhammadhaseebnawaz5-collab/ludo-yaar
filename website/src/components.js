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

    roll() {
        this.rolling = true;
        this.rollFrames = 0;
        this.value = Math.floor(Math.random() * 6) + 1;
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

    draw(ctx, x, y, size = 55) {
        const val = this.rolling ? this.displayValue : this.value;
        
        // Shadow
        ctx.fillStyle = 'rgba(40, 20, 40, 1)';
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 4, size, size, 12);
        ctx.fill();

        // Dice body
        ctx.fillStyle = COLORS.WHITE;
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, 12);
        ctx.fill();
        
        ctx.strokeStyle = COLORS.DARK_GRAY;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Dots
        const dotPositions = {
            1: [[0.5, 0.5]],
            2: [[0.25, 0.25], [0.75, 0.75]],
            3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
            4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
            5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
            6: [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]]
        };

        ctx.fillStyle = COLORS.BLACK;
        const dots = dotPositions[val] || [];
        dots.forEach(([dx, dy]) => {
            const dotX = x + dx * size;
            const dotY = y + dy * size;
            ctx.beginPath();
            ctx.arc(dotX, dotY, size / 9, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = COLORS.DARK_GRAY;
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }
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

        // Turn Timer Ring (Green)
        if (this.active && this.timerPercent > 0) {
            ctx.strokeStyle = COLORS.GREEN;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.timerPercent));
            ctx.stroke();
        }

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

export class AudioControl {
    constructor(x, y, mode = 'speaker') {
        this.x = x;
        this.y = y;
        this.active = false;
        this.pulse = 0;
        this.size = 30;
        this.mode = mode; // 'mic' or 'speaker'
    }

    update() {
        this.pulse += 0.1;
    }

    draw(ctx) {
        const color = (this.active && this.mode === 'mic') ? COLORS.RED : COLORS.DARK_GRAY;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.WHITE;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (this.mode === 'mic') {
            // Mic icon
            ctx.fillStyle = COLORS.WHITE;
            ctx.beginPath();
            ctx.roundRect(this.x - 4, this.y - 7, 8, 14, 4);
            ctx.fill();

            ctx.strokeStyle = COLORS.WHITE;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y - 2, 8, Math.PI, Math.PI * 2, true);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(this.x, this.y + 4);
            ctx.lineTo(this.x, this.y + 8);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(this.x - 5, this.y + 8);
            ctx.lineTo(this.x + 5, this.y + 8);
            ctx.stroke();
        } else {
            // Speaker icon
            ctx.fillStyle = COLORS.WHITE;
            ctx.beginPath();
            ctx.moveTo(this.x - 6, this.y - 3);
            ctx.lineTo(this.x - 2, this.y - 3);
            ctx.lineTo(this.x + 3, this.y - 7);
            ctx.lineTo(this.x + 3, this.y + 7);
            ctx.lineTo(this.x - 2, this.y + 3);
            ctx.lineTo(this.x - 6, this.y + 3);
            ctx.closePath();
            ctx.fill();

            // Sound waves
            ctx.strokeStyle = COLORS.WHITE;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(this.x + 1, this.y, 6, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(this.x + 1, this.y, 10, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
        }

        if (this.active) {
            for (let i = 0; i < 3; i++) {
                const r = this.size / 2 + 5 + i * 7;
                const alpha = (0.5 - i * 0.15 + Math.sin(this.pulse + i) * 0.1);
                ctx.strokeStyle = this.mode === 'mic' ? `rgba(255, 100, 100, ${alpha})` : `rgba(100, 204, 255, ${alpha})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    handleClick(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        if (Math.sqrt(dx * dx + dy * dy) <= this.size / 2) {
            this.active = !this.active;
            return true;
        }
        return false;
    }
}

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

    draw(ctx) {
        if (!this.activeToken) return;

        const x = this.activeToken.px;
        const y = this.activeToken.py - 60;
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

    handleClick(sx, sy) {
        if (!this.activeToken) return null;
        const x = this.activeToken.px;
        const y = this.activeToken.py - 60;
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
    }

    show(token, homePos, lapPos) {
        this.activeToken = token;
        this.homePos = homePos;
        this.lapPos = lapPos;
    }

    hide() {
        this.activeToken = null;
    }

    draw(ctx) {
        if (!this.activeToken) return;

        // Draw Home Arrow
        this.drawArrow(ctx, this.homePos, 'HOME', COLORS.GOLD);
        // Draw Lap Arrow
        this.drawArrow(ctx, this.lapPos, 'LAP', COLORS.WHITE);
    }

    drawArrow(ctx, pos, text, color) {
        const [x, y] = pos;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.BLACK;
        ctx.stroke();

        ctx.fillStyle = color === COLORS.GOLD ? COLORS.BLACK : COLORS.PURPLE;
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.fillText(text, x, y + 4);
    }

    handleClick(sx, sy) {
        if (!this.activeToken) return null;
        if (Math.hypot(sx - this.homePos[0], sy - this.homePos[1]) < 20) return 'home';
        if (Math.hypot(sx - this.lapPos[0], sy - this.lapPos[1]) < 20) return 'lap';
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

