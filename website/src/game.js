import { 
    SCREEN_W, SCREEN_H, BOARD_X, BOARD_Y, BOARD_SIZE, CELL, COLORS, 
    PLAYER_COLORS, PLAYER_LIGHT, PLAYER_DARK, PLAYER_NAMES, HOME_POSITIONS, 
    STAR_POSITIONS, MAIN_PATH, HOME_STRETCHES,
    PLAYER_START_INDICES, PLAYER_HOME_ENTRIES, SAFE_INDICES, TEAM_MAP,
    PLAYER_ROTATIONS, BOARD_X, BOARD_Y, BOARD_SIZE
} from './constants.js';
import { 
    DiceAnimation, Token, ChatSystem, ProfileAvatar, AudioControl,
    MoveSelectionOverlay, JunctionArrows, SynthesizedAudioManager 
} from './components.js';

// ─── BOARD CELL TYPE CLASSIFIER ─────────────────────────────────────
function getCellType(col, row) {
    // Home bases (corners)
    if (col <= 5 && row <= 5) return { type: 'home', player: 0 };     // P0 TL
    if (col >= 9 && row <= 5) return { type: 'home', player: 1 };     // P1 TR
    if (col >= 9 && row >= 9) return { type: 'home', player: 2 };     // P2 BR
    if (col <= 5 && row >= 9) return { type: 'home', player: 3 };     // P3 BL
    // Center
    if (col >= 6 && col <= 8 && row >= 6 && row <= 8) return { type: 'center' };
    // Home stretch lanes (Clockwise standard alignment)
    if (row === 7 && col >= 1 && col <= 6) return { type: 'stretch', player: 0 }; // Left Arm = Yellow (TL)
    if (col === 7 && row >= 1 && row <= 6) return { type: 'stretch', player: 1 }; // Top Arm = Blue (TR)
    if (row === 7 && col >= 8 && col <= 13) return { type: 'stretch', player: 2 }; // Right Arm = Red (BR)
    if (col === 7 && row >= 8 && row <= 13) return { type: 'stretch', player: 3 }; // Bottom Arm = Green (BL)
    // Track
    return { type: 'track' };
}

function isStartCell(col, row) {
    return (col === 1 && row === 6) ||  // P0 Yellow (TL exits right to Left Arm top)
           (col === 8 && row === 1) ||  // P1 Blue (TR exits right to Top Arm right)
           (col === 13 && row === 8) || // P2 Red (BR exits right to Right Arm bot)
           (col === 6 && row === 13);   // P3 Green (BL exits right to Bot Arm left)
}

function getStartPlayer(col, row) {
    if (col === 1 && row === 6) return 0;
    if (col === 8 && row === 1) return 1;
    if (col === 13 && row === 8) return 2;
    if (col === 6 && row === 13) return 3;
    return -1;
}

function isSafeCell(col, row) {
    return STAR_POSITIONS.some(([sc, sr]) => sc === col && sr === row);
}

// ─── EMOJI PANEL ─────────────────────────────────────────────────────
class EmojiPanel {
    constructor() {
        this.emojis = ["😀","😂","😎","🎲","🏆","👍","❤️","🔥","😡","😢","🎉","👑","💪","🤣","😤","🥳","😱","🤩"];
        this.visible = false;
        this.displayTimer = 0;
        this.displayEmoji = null;
        this.displayPos = [240, 300];
    }
    draw(ctx, x, y) {
        if (!this.visible) return;
        const cols = 6, rows = 3, pad = 8, size = 32;
        const w = cols * (size + pad) + pad;
        const h = rows * (size + pad) + pad;
        ctx.fillStyle = 'rgba(30,15,50,0.95)';
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
        ctx.strokeStyle = COLORS.GOLD; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '22px Arial'; ctx.textAlign = 'center';
        for (let i = 0; i < Math.min(this.emojis.length, cols * rows); i++) {
            const ex = x + pad + (i % cols) * (size + pad) + size / 2;
            const ey = y + pad + Math.floor(i / cols) * (size + pad) + size - 4;
            ctx.fillText(this.emojis[i], ex, ey);
        }
    }
    drawFloating(ctx) {
        if (this.displayEmoji && this.displayTimer > 0) {
            this.displayTimer--;
            ctx.globalAlpha = Math.min(1, this.displayTimer / 20);
            ctx.font = '60px Arial'; ctx.textAlign = 'center';
            ctx.fillText(this.displayEmoji, this.displayPos[0], this.displayPos[1]);
            ctx.globalAlpha = 1;
        }
    }
    getEmojiGridBounds(x, y) {
        const cols = 6, pad = 8, size = 32;
        return { cols, pad, size, x, y };
    }
}

// ─── LUDO GAME CLASS ─────────────────────────────────────────────────
export class LudoGame {
    constructor() {
        this.boardX = BOARD_X;
        this.boardY = BOARD_Y;
        this.boardSize = BOARD_SIZE;
        this.cell = CELL;

        this.clientPlayer = 2;   // Govind = Red = Bottom-Left
        this.currentPlayer = 2;  // Start with Red
        this.tokens = [];
        this.gameState = "setup";
        this.playerCount = 4;
        this.teamUpMode = false;

        this.audio = new SynthesizedAudioManager();
        this.moveSelection = new MoveSelectionOverlay();
        this.junctionArrows = new JunctionArrows();

        // Board never rotates — fixed standard top-down view
        this.currentRotation = 0;
        this.targetRotation = 0;

        this.winner = null;
        this.dice = new DiceAnimation();
        this.rollQueue = [];
        this.diceRolled = false;

        this.chat = new ChatSystem();
        this.emojiPanel = new EmojiPanel();
        this.speakerPanelVisible = false;
        this.muteStates = Array.from({length:4}, () => [false,false,false,false]);

        // Initialize tokens
        for (let p = 0; p < 4; p++) {
            const playerTokens = [];
            HOME_POSITIONS[p].forEach((pos, i) => {
                const t = new Token(p, i, pos);
                const [px, py] = this.getCellPixel(pos[0], pos[1]);
                t.px = px; t.py = py;
                playerTokens.push(t);
            });
            this.tokens.push(playerTokens);
        }

        // Avatars (positions are just defaults; drawPlayerCard overrides)
        this.avatars = [
            new ProfileAvatar(PLAYER_NAMES[0], PLAYER_COLORS[0], [44, 52]),
            new ProfileAvatar(PLAYER_NAMES[1], PLAYER_COLORS[1], [SCREEN_W - 44, 52]),
            new ProfileAvatar(PLAYER_NAMES[2], PLAYER_COLORS[2], [44, SCREEN_H - 112]),
            new ProfileAvatar(PLAYER_NAMES[3], PLAYER_COLORS[3], [SCREEN_W - 44, SCREEN_H - 112])
        ];

        this.localMicMuted = false;
        this.remoteMicMuted = [false, false, false, false]; // simulate remote states

        this.particles = [];
        this.timer = 0;
        this.pendingMove = null;
        this.network = null;
        this.turnEndsAt = 0;
        this.turnDuration = 10000;
    }

    getCellPixel(gx, gy) {
        return [
            this.boardX + gx * this.cell + this.cell / 2,
            this.boardY + gy * this.cell + this.cell / 2
        ];
    }

    // ─── BOARD DRAWING ──────────────────────────────────────────────
    drawBoard(ctx) {
        const { boardX: bx, boardY: by, cell: C } = this;

        ctx.save();
        
        // Outer Board Glow / Drop Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10;
        
        // Board outer border (Chocolate Brown) with heavy rounded corners
        ctx.fillStyle = COLORS.BOARD_BORDER;
        ctx.beginPath();
        ctx.roundRect(bx - 8, by - 8, this.boardSize + 16, this.boardSize + 16, 24);
        ctx.fill();
        
        ctx.restore();

        // White base for the grid
        ctx.fillStyle = COLORS.WHITE;
        ctx.beginPath();
        ctx.roundRect(bx, by, this.boardSize, this.boardSize, 16);
        ctx.fill();

        ctx.save();
        // Clip to rounded board inner rect to avoid corners bleeding
        ctx.beginPath();
        ctx.roundRect(bx, by, this.boardSize, this.boardSize, 16);
        ctx.clip();

        // Draw each cell
        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                const rx = bx + col * C;
                const ry = by + row * C;
                const cell = getCellType(col, row);

                if (cell.type === 'center' || cell.type === 'home') continue; 

                // Track / stretch cells
                let bg = COLORS.TRACK_BG;
                let isStretch = false;
                if (cell.type === 'stretch') {
                    bg = PLAYER_COLORS[cell.player];
                    isStretch = true;
                }
                const isStart = isStartCell(col, row);
                if (isStart) {
                    bg = PLAYER_COLORS[getStartPlayer(col, row)];
                }

                // ── Main fill ──
                ctx.fillStyle = bg;
                ctx.fillRect(rx, ry, C, C);

                if (isStretch || isStart) {
                    // Sharp white inner border for colored cells (image_1 style)
                    ctx.strokeStyle = 'rgba(255,255,255,0.40)';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(rx + 1.5, ry + 1.5, C - 3, C - 3);
                    // Dark outer edge
                    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(rx, ry, C, C);
                } else {
                    // Track cell: outer border
                    ctx.strokeStyle = 'rgba(170,170,170,0.9)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(rx, ry, C, C);
                    // Inner inset box (creates the "outlined box" texture of image_1)
                    ctx.strokeStyle = 'rgba(230,230,230,0.7)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(rx + 2.5, ry + 2.5, C - 5, C - 5);
                }

                // Draw 🚫 prohibition circle on start cells
                if (isStart) {
                    this.drawStartArrow(ctx, col, row, rx, ry, C, getStartPlayer(col, row));
                }
            }
        }

        // Center (winning zone) - draw before home bases to stay under
        this.drawCenter(ctx);

        ctx.restore(); // remove clip

        // Draw home base areas dynamically from player config
        this.drawHomeBase(ctx, bx,         by,         PLAYER_COLORS[0], PLAYER_DARK[0], 0); // TL
        this.drawHomeBase(ctx, bx + 9 * C, by,         PLAYER_COLORS[1], PLAYER_DARK[1], 1); // TR
        this.drawHomeBase(ctx, bx + 9 * C, by + 9 * C, PLAYER_COLORS[2], PLAYER_DARK[2], 2); // BR
        this.drawHomeBase(ctx, bx,         by + 9 * C, PLAYER_COLORS[3], PLAYER_DARK[3], 3); // BL

        // Stars on top of everything
        this.drawStarsOnBoard(ctx);
    }

    drawHomeBase(ctx, x, y, mainColor, darkColor, player) {
        const C = this.cell;
        const size = 6 * C;

        // Background
        ctx.fillStyle = darkColor; // Darker shade as requested
        ctx.beginPath();
        // Adjust radius depending on corner
        let radii = [0,0,0,0]; // [TopLeft, TopRight, BottomRight, BottomLeft]
        if(player === 0) radii = [16,0,0,0];      // P0 TL
        else if(player === 1) radii = [0,16,0,0]; // P1 TR
        else if(player === 2) radii = [0,0,16,0]; // P2 BR
        else if(player === 3) radii = [0,0,0,16]; // P3 BL
        ctx.roundRect(x, y, size, size, radii);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // White inner box
        const margin = C;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(x + margin, y + margin, 4 * C, 4 * C, 20);
        ctx.fill();

        // Light colored inner
        ctx.fillStyle = mainColor;
        const innerM = C * 0.25;
        ctx.beginPath();
        ctx.roundRect(x + margin + innerM, y + margin + innerM, 4*C - innerM*2, 4*C - innerM*2, 16);
        ctx.fill();

        // 4 token spots
        const spots = [
            [x + 1.75*C, y + 1.75*C],
            [x + 4.25*C, y + 1.75*C],
            [x + 1.75*C, y + 4.25*C],
            [x + 4.25*C, y + 4.25*C],
        ];
        spots.forEach(([sx, sy]) => {
            // White ring
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath(); ctx.arc(sx, sy, C * 0.45, 0, Math.PI * 2); ctx.fill();
            // Colored fill
            const grad = ctx.createRadialGradient(sx - C*0.1, sy - C*0.1, 0, sx, sy, C*0.35);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(1, '#DDDDDD');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(sx, sy, C * 0.38, 0, Math.PI * 2); ctx.fill();
            // Inner shadow
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx, sy, C * 0.38, 0, Math.PI * 2); ctx.stroke();
        });
    }

    // Draws a 🚫-style prohibition circle on start cells (replaces old arrow)
    drawStartArrow(ctx, col, row, rx, ry, C, player) {
        const cx = rx + C / 2;
        const cy = ry + C / 2;
        const r  = C * 0.36;
        ctx.save();
        // White circle fill
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fill();
        // Red prohibition ring
        ctx.strokeStyle = 'rgba(210,0,0,0.88)';
        ctx.lineWidth = r * 0.30;
        ctx.stroke();
        // Horizontal bar
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.68, cy);
        ctx.lineTo(cx + r * 0.68, cy);
        ctx.strokeStyle = 'rgba(210,0,0,0.92)';
        ctx.lineWidth = r * 0.34;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }

    drawCenter(ctx) {
        const { boardX: bx, boardY: by, cell: C } = this;
        const cx = bx + 7.5 * C, cy = by + 7.5 * C;
        const h = C * 1.5; // exactly fills the 3×3 center

        // 4 triangles (Colors matched perfectly to their stretches)
        const triangles = [
            { pts: [[cx,cy],[cx-h,cy-h],[cx+h,cy-h]], color: COLORS.BLUE   }, // Top (Player 1)
            { pts: [[cx,cy],[cx+h,cy-h],[cx+h,cy+h]], color: COLORS.RED    }, // Right (Player 2)
            { pts: [[cx,cy],[cx-h,cy+h],[cx+h,cy+h]], color: COLORS.GREEN  }, // Bottom (Player 3)
            { pts: [[cx,cy],[cx-h,cy-h],[cx-h,cy+h]], color: COLORS.YELLOW }, // Left (Player 0)
        ];

        triangles.forEach(t => {
            ctx.fillStyle = t.color;
            ctx.beginPath();
            ctx.moveTo(t.pts[0][0], t.pts[0][1]);
            ctx.lineTo(t.pts[1][0], t.pts[1][1]);
            ctx.lineTo(t.pts[2][0], t.pts[2][1]);
            ctx.closePath(); ctx.fill();
        });
        triangles.forEach(t => {
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(t.pts[0][0], t.pts[0][1]);
            ctx.lineTo(t.pts[1][0], t.pts[1][1]);
            ctx.lineTo(t.pts[2][0], t.pts[2][1]);
            ctx.closePath(); ctx.stroke();
        });
        // Trophy in center
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(cx, cy, C * 0.65, 0, Math.PI * 2); ctx.fill();
        ctx.font = `${Math.ceil(C * 0.85)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('🏆', cx, cy + C * 0.3);
    }

    // Draws 🚫-style prohibition circles at midpoint safe squares
    drawStarsOnBoard(ctx) {
        STAR_POSITIONS.forEach(([col, row]) => {
            if (!isStartCell(col, row)) {
                const [px, py] = this.getCellPixel(col, row);
                const r = this.cell * 0.33;
                ctx.save();
                // White fill
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.90)';
                ctx.fill();
                // Red ring
                ctx.strokeStyle = 'rgba(210,0,0,0.85)';
                ctx.lineWidth = r * 0.28;
                ctx.stroke();
                // Horizontal bar
                ctx.beginPath();
                ctx.moveTo(px - r * 0.68, py);
                ctx.lineTo(px + r * 0.68, py);
                ctx.strokeStyle = 'rgba(210,0,0,0.90)';
                ctx.lineWidth = r * 0.32;
                ctx.lineCap = 'round';
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

        this.avatars.forEach((a, i) => {
            a.update();
            a.active = (i === this.currentPlayer);
            a.timerPercent = a.active ? currentTimerPercent : 0;
        });

        this.tokens.forEach((pt, i) => { if (i < this.playerCount) pt.forEach(t => t.update()); });
    }

    draw(ctx) {
        if (this.gameState === "setup") { this.drawSetupScreen(ctx); return; }

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

        // Draw rotated game elements
        this.drawBoard(ctx);
        this.drawTokenGlows(ctx);
        this.tokens.forEach((pt, p) => { if (p < this.playerCount) pt.forEach(t => t.draw(ctx)); });
        this.junctionArrows.draw(ctx);
        
        ctx.restore();
        // --- END ROTATION ---

        // UI Overlays (Not rotated)
        this.drawTopBar(ctx);
        this.drawBottomBar(ctx);
        this.drawDiceArea(ctx);
        this.drawParticles(ctx);

        this.moveSelection.draw(ctx);

        if (this.chat.visible) this.chat.draw(ctx, 10, 390, 290, 160);
        
        if (this.emojiPanel.visible) this.emojiPanel.draw(ctx, 20, 520);
        this.emojiPanel.drawFloating(ctx);

        if (this.winner !== null) this.drawWinnerScreen(ctx);
    }

    // ─── SETUP SCREEN ────────────────────────────────────────────────
    drawSetupScreen(ctx) {
        // Background gradient
        const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
        grad.addColorStop(0, '#1A0A35');
        grad.addColorStop(1, '#4A1A6B');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

        // Title
        ctx.fillStyle = COLORS.GOLD;
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎲 LUDO STAR', SCREEN_W / 2, 120);
        ctx.font = '16px Arial';
        ctx.fillStyle = COLORS.GRAY;
        ctx.fillText('Select number of players', SCREEN_W / 2, 155);

        // Player count buttons
        [2, 3, 4].forEach((n, i) => {
            const x = SCREEN_W / 2, y = 220 + i * 85;
            const selected = this.playerCount === n;
            ctx.fillStyle = selected ? COLORS.GOLD : '#3A1060';
            ctx.beginPath(); ctx.roundRect(x - 80, y - 28, 160, 56, 16); ctx.fill();
            ctx.strokeStyle = selected ? '#FFFFFF' : COLORS.PURPLE;
            ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = selected ? '#000' : COLORS.WHITE;
            ctx.font = `bold 20px Arial`;
            ctx.fillText(`${n} Players`, x, y + 8);
        });

        // Team Up toggle (only for 4 players)
        if (this.playerCount === 4) {
            const tx = SCREEN_W / 2, ty = 488;
            ctx.fillStyle = this.teamUpMode ? COLORS.GREEN : '#3A1060';
            ctx.beginPath(); ctx.roundRect(tx - 90, ty - 24, 180, 48, 14); ctx.fill();
            ctx.strokeStyle = this.teamUpMode ? '#FFFFFF' : COLORS.PURPLE;
            ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = COLORS.WHITE;
            ctx.font = 'bold 17px Arial';
            ctx.fillText(this.teamUpMode ? '✅ TEAM UP ON' : '👥 TEAM UP', tx, ty + 7);
        }

        // START button
        const sy = this.playerCount === 4 ? 575 : 490;
        ctx.fillStyle = COLORS.GREEN;
        ctx.beginPath(); ctx.roundRect(SCREEN_W/2 - 70, sy - 26, 140, 52, 14); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = COLORS.WHITE;
        ctx.font = 'bold 22px Arial';
        ctx.fillText('▶ START', SCREEN_W/2, sy + 9);
    }

    // ─── TOP BAR ─────────────────────────────────────────────────────
    drawTopBar(ctx) {
        ctx.fillStyle = 'rgba(10, 5, 20, 0.92)';
        ctx.fillRect(0, 0, SCREEN_W, 108);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 108); ctx.lineTo(SCREEN_W, 108); ctx.stroke();
        if (0 < this.playerCount) this.drawPlayerCard(ctx, 0);
        if (1 < this.playerCount) this.drawPlayerCard(ctx, 1);
    }

    // ─── TILE GLOWS ──────────────────────────────────────────────────
    drawTokenGlows(ctx) {
        if (this.gameState === "setup" || this.gameState === "lobby") return;

        ctx.save();
        ctx.globalCompositeOperation = "screen";

        this.tokens.forEach((pt, p) => {
            if (p >= this.playerCount) return;
            pt.forEach(t => {
                // Glow the exact box/tile the token is sitting on
                if (t.inHome || t.finished) return; 
                
                const margin = 2;
                const gx = t.px - this.cell/2 + margin;
                const gy = t.py - this.cell/2 + margin;
                const sz = this.cell - margin*2;

                ctx.globalAlpha = 0.4 + Math.sin(this.timer * 0.1) * 0.2;
                ctx.fillStyle = PLAYER_LIGHT[p];
                ctx.beginPath();
                ctx.roundRect(gx, gy, sz, sz, 4);
                ctx.fill();
                
                // Outer bright border for the tile
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        });

        ctx.restore();
    }

    // ─── BOTTOM BAR ──────────────────────────────────────────────────
    drawBottomBar(ctx) {
        const barY = SCREEN_H - 160;
        ctx.fillStyle = 'rgba(10, 5, 20, 0.92)';
        ctx.fillRect(0, barY, SCREEN_W, 160);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(SCREEN_W, barY); ctx.stroke();

        if (2 < this.playerCount) this.drawPlayerCard(ctx, 2);
        if (3 < this.playerCount) this.drawPlayerCard(ctx, 3);

        // Graphics-based EMOJI / CHAT / MIC / SPEAKER buttons at very bottom
        const buttons = [
            { id: 'emoji', label: 'EMOJI', state: this.emojiPanel.visible },
            { id: 'chat', label: 'CHAT', state: this.chat.visible },
            { id: 'mic', label: 'MIC', state: !this.localMicMuted },
            { id: 'audio', label: 'AUDIO', state: this.speakerPanelVisible }
        ];

        buttons.forEach((btn, i) => {
            const bx = 12 + i * 80;
            const by = SCREEN_H - 34;
            ctx.fillStyle = btn.state ? 'rgba(100,40,160,0.95)' : 'rgba(45,18,80,0.88)';
            ctx.beginPath(); ctx.roundRect(bx, by, 72, 28, 7); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
            
            // Draw Icon SVG Paths centered inside the button
            const iconX = bx + 36;
            const iconY = by + 14;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#fff';
            
            if (btn.id === 'emoji') {
                // Happy outline face
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(iconX, iconY, 10, 0, Math.PI*2); ctx.stroke();
                ctx.beginPath(); ctx.arc(iconX - 3, iconY - 2, 1.5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(iconX + 3, iconY - 2, 1.5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(iconX, iconY, 5, 0, Math.PI); ctx.stroke();
            } else if (btn.id === 'chat') {
                // Speech bubble 
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.roundRect(iconX - 10, iconY - 7, 20, 14, 4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(iconX - 5, iconY + 7); ctx.lineTo(iconX - 3, iconY + 12); ctx.lineTo(iconX, iconY + 7); ctx.fill();
            } else if (btn.id === 'mic') {
                // Mic Icon
                ctx.beginPath(); ctx.roundRect(iconX - 3, iconY - 8, 6, 12, 3); ctx.fill();
                ctx.beginPath(); ctx.arc(iconX, iconY - 2, 8, 0, Math.PI); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(iconX, iconY + 6); ctx.lineTo(iconX, iconY + 10); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(iconX - 4, iconY + 10); ctx.lineTo(iconX + 4, iconY + 10); ctx.stroke();
                if (this.localMicMuted) {
                    ctx.strokeStyle = '#FF3333'; ctx.lineWidth = 2.5;
                    ctx.beginPath(); ctx.moveTo(iconX - 10, iconY - 8); ctx.lineTo(iconX + 10, iconY + 8); ctx.stroke();
                }
            } else if (btn.id === 'audio') {
                // Speaker Icon
                ctx.beginPath(); ctx.moveTo(iconX - 6, iconY - 3); ctx.lineTo(iconX - 3, iconY - 3);
                ctx.lineTo(iconX + 2, iconY - 7); ctx.lineTo(iconX + 2, iconY + 7);
                ctx.lineTo(iconX - 3, iconY + 3); ctx.lineTo(iconX - 6, iconY + 3); ctx.fill();
                ctx.beginPath(); ctx.arc(iconX + 2, iconY, 5, -Math.PI/3, Math.PI/3); ctx.stroke();
                ctx.beginPath(); ctx.arc(iconX + 2, iconY, 8, -Math.PI/3, Math.PI/3); ctx.stroke();
                
                // Mute logic
                if (!this.speakerPanelVisible) {
                    ctx.strokeStyle = '#FF3333'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(iconX - 8, iconY - 8); ctx.lineTo(iconX + 10, iconY + 8); ctx.stroke();
                }
            }
        });
    }

    // ─── PLAYER CARD ─────────────────────────────────────────────────
    drawPlayerCard(ctx, i) {
        const isTop    = i <= 1;
        const isRight  = i === 1 || i === 3;
        const isActive = i === this.currentPlayer;
        const color    = PLAYER_COLORS[i];
        const name     = PLAYER_NAMES[i];

        const avR =  30;
        const avX  = isRight ? SCREEN_W - 14 - avR : 14 + avR;
        const avY  = isTop   ? 54 : SCREEN_H - 108;

        // Update avatar position so ProfileAvatar.draw() isn't needed separately
        this.avatars[i].position = [avX, avY];

        // Active glow
        if (isActive) {
            const pulse = (Math.sin(this.timer * 0.12) + 1) / 2;
            ctx.strokeStyle = `rgba(255,255,255,${0.3 + pulse * 0.6})`;
            ctx.lineWidth = 3 + pulse * 3;
            ctx.beginPath(); ctx.arc(avX, avY, avR + 7, 0, Math.PI * 2); ctx.stroke();
        }

        // Circle fill with gradient
        const grad = ctx.createRadialGradient(avX - 8, avY - 8, 2, avX, avY, avR);
        grad.addColorStop(0, PLAYER_LIGHT[i]);
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // Initials
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(name.substring(0, 2).toUpperCase(), avX, avY);
        ctx.textBaseline = 'alphabetic';

        // Border ring
        ctx.strokeStyle = isActive ? '#fff' : COLORS.GOLD;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.stroke();

        // Name label
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '11px Inter, Arial'; ctx.textAlign = 'center';
        const nameY = isTop ? avY + avR + 14 : avY + avR + 14;
        ctx.fillText(name.substring(0, 14), avX, nameY);

        // Remote Speaker Indicator
        if (i !== this.clientPlayer && i < this.playerCount) {
            const spkX = isRight ? avX - avR - 10 : avX + avR + 10;
            const spkY = avY + 12;
            
            ctx.fillStyle = 'rgba(10,5,20,0.8)';
            ctx.beginPath(); ctx.arc(spkX, spkY, 12, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
            
            // Speaker icon
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.moveTo(spkX - 3, spkY - 2); ctx.lineTo(spkX - 1, spkY - 2);
            ctx.lineTo(spkX + 2, spkY - 4); ctx.lineTo(spkX + 2, spkY + 4);
            ctx.lineTo(spkX - 1, spkY + 2); ctx.lineTo(spkX - 3, spkY + 2);
            ctx.closePath(); ctx.fill();

            if (this.remoteMicMuted[i]) {
                ctx.strokeStyle = '#FF3333';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(spkX - 7, spkY - 7); ctx.lineTo(spkX + 7, spkY + 7); ctx.stroke();
            } else {
                ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(spkX + 1, spkY, 4, -Math.PI/4, Math.PI/4); ctx.stroke();
            }
        }
    }

    // ─── DICE AREA ───────────────────────────────────────────────────
    drawDiceArea(ctx) {
        if (this.gameState === 'setup') return;
        const p       = this.currentPlayer;
        const isTop   = p <= 1;
        const isRight = p === 1 || p === 3;

        // Cluster anchor: dice left, crown right
        // For left players  → cluster starts at x=90
        // For right players → cluster starts at x=SCREEN_W-240
        const clX = isRight ? SCREEN_W - 238 : 92;
        const clY = isTop ? 18 : SCREEN_H - 152;

        // 3D Dice (Glow removed as requested)
        this.draw3DDice(ctx, clX, clY, 46);

        // Crown / Roll button (big circle)
        const crX = clX + 62;
        const crY = clY + 23;
        const crR = 22;
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
        ctx.fillStyle = this.gameState === 'roll' ? COLORS.RED : '#444';
        ctx.beginPath(); ctx.arc(crX, crY, crR, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(crX, crY, crR, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = COLORS.GOLD;
        ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('♛', crX, crY);
        ctx.textBaseline = 'alphabetic';

        // Rolled value bubble (shown when a roll is pending)
        if (this.rollQueue.length > 0) {
            const rvX = clX + 132;
            const rvY = clY + 18;
            ctx.fillStyle = PLAYER_COLORS[p];
            ctx.beginPath(); ctx.arc(rvX, rvY, 13, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(rvX, rvY, 13, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(this.rollQueue[0]), rvX, rvY);
            ctx.textBaseline = 'alphabetic';
        }
    }

    draw3DDice(ctx, x, y, size) {
        const val = this.dice.rolling ? this.dice.displayValue : this.dice.value;
        const r = 10;

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.roundRect(x+5, y+5, size, size, r+2); ctx.fill();

        // Glass-gradient body
        const bodyGrad = ctx.createLinearGradient(x, y, x+size, y+size);
        bodyGrad.addColorStop(0, '#FFFFFF');
        bodyGrad.addColorStop(0.5, '#F0F0F0');
        bodyGrad.addColorStop(1, '#D0D0D0');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath(); ctx.roundRect(x, y, size, size, r); ctx.fill();

        // Edge shading
        ctx.strokeStyle = '#A0A0A0';
        ctx.lineWidth = 2; ctx.stroke();

        // Inner bevel
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(x+3, y+3, size-6, size-6, r-2); ctx.stroke();

        // Top-left shine
        const shineGrad = ctx.createLinearGradient(x, y, x+size*0.5, y+size*0.5);
        shineGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
        shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineGrad;
        ctx.beginPath(); ctx.roundRect(x+4, y+4, size-8, size*0.55, r-3); ctx.fill();

        // Dots
        const dp = {
            1:[[.5,.5]],
            2:[[.25,.28],[.75,.72]],
            3:[[.25,.25],[.5,.5],[.75,.75]],
            4:[[.25,.25],[.75,.25],[.25,.75],[.75,.75]],
            5:[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],
            6:[[.25,.22],[.75,.22],[.25,.5],[.75,.5],[.25,.78],[.75,.78]]
        };
        const dots = dp[val] || [];
        dots.forEach(([dx, dy]) => {
            const dotX = x + dx * size;
            const dotY = y + dy * size;
            const dotR = size / 10;
            // Dot shadow
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath(); ctx.arc(dotX+1,dotY+1,dotR,0,Math.PI*2); ctx.fill();
            // Dot
            const dotGrad = ctx.createRadialGradient(dotX-1, dotY-1, 0, dotX, dotY, dotR);
            dotGrad.addColorStop(0, '#555');
            dotGrad.addColorStop(1, '#111');
            ctx.fillStyle = dotGrad;
            ctx.beginPath(); ctx.arc(dotX, dotY, dotR, 0, Math.PI*2); ctx.fill();
        });
    }

    // ─── TURN INDICATOR ──────────────────────────────────────────────
    drawTurnIndicator(ctx) {
        const y = this.boardY + this.boardSize + 12 + Math.sin(this.timer * 0.1) * 4;
        ctx.fillStyle = PLAYER_COLORS[this.currentPlayer];
        ctx.beginPath();
        ctx.moveTo(SCREEN_W/2, y+12); ctx.lineTo(SCREEN_W/2-10, y); ctx.lineTo(SCREEN_W/2+10, y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1; ctx.stroke();

        ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.WHITE;
        ctx.fillText(PLAYER_NAMES[this.currentPlayer] + "'s Turn", SCREEN_W/2, y + 26);
    }

    // ─── SPEAKER PANEL ───────────────────────────────────────────────
    drawSpeakerPanel(ctx) {
        const pX = SCREEN_W/2 - 70, pY = SCREEN_H - 155;
        const others = Array.from({length: this.playerCount}, (_,i) => i).filter(i => i !== this.currentPlayer);
        const h = others.length * 36 + 20;
        ctx.fillStyle = 'rgba(30,12,55,0.96)';
        ctx.beginPath(); ctx.roundRect(pX, pY, 140, h, 10); ctx.fill();
        ctx.strokeStyle = COLORS.GOLD; ctx.lineWidth = 1.5; ctx.stroke();

        let dY = pY + 22;
        others.forEach(i => {
            ctx.fillStyle = PLAYER_COLORS[i];
            ctx.beginPath(); ctx.arc(pX + 18, dY - 4, 7, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = COLORS.WHITE; ctx.font = '13px Arial'; ctx.textAlign = 'left';
            ctx.fillText(PLAYER_NAMES[i].split(' ')[0], pX + 30, dY + 1);
            const muted = this.muteStates[this.currentPlayer][i];
            ctx.fillStyle = muted ? COLORS.RED : COLORS.GREEN;
            ctx.beginPath(); ctx.roundRect(pX + 100, dY - 10, 28, 14, 7); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(muted ? 'OFF' : 'ON', pX + 114, dY + 1);
            dY += 36;
        });
    }

    // ─── PARTICLES ───────────────────────────────────────────────────
    drawParticles(ctx) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life--; p.x += p.vx; p.y += p.vy; p.vy += 0.2;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    spawnParticles(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y, vx: (Math.random()-0.5)*8, vy: Math.random()*-6-1,
                color, life: 30+Math.random()*20, maxLife: 50, size: 3+Math.random()*4
            });
        }
    }

    // ─── GAME LOGIC ──────────────────────────────────────────────────
    rollDice() {
        if (this.gameState === "roll" && !this.dice.rolling) {
            this.dice.roll();
            this.diceRolled = true;
            this.audio.playDiceRoll();
            setTimeout(() => {
                const val = this.dice.value;
                this.rollQueue.push(val);
                this.chat.addMessage(PLAYER_NAMES[this.currentPlayer], `Rolled ${val}!`, PLAYER_COLORS[this.currentPlayer]);
                
                const sixCount = this.rollQueue.filter(v => v === 6).length;
                if (sixCount === 3) {
                    this.rollQueue = [];
                    this.diceRolled = false;
                    this.nextTurn();
                } else if (val === 6) {
                    this.diceRolled = false; // Roll again
                } else {
                    this.gameState = "move";
                }
                
                if (this.gameState === "move" && !this.canAnyMove()) setTimeout(() => this.nextTurn(), 800);
            }, 600);
        }
    }

    canAnyMove() {
        let pIndex = this.currentPlayer;
        if (this.teamUpMode && this.tokens[pIndex].every(t => t.finished)) {
            pIndex = (pIndex + 2) % 4;
        }
        return this.tokens[pIndex].some(t => this.rollQueue.some(r => this.canTokenMove(t, r)));
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
        if (this.gameState !== "move") return;
        let pIndex = this.currentPlayer;
        if (this.teamUpMode && this.tokens[pIndex].every(t => t.finished)) {
            pIndex = (pIndex + 2) % 4;
        }

        for (const t of this.tokens[pIndex]) {
            if (Math.hypot(x - t.px, y - t.py) < 24) {
                const valid = this.rollQueue.filter(r => this.canTokenMove(t, r));
                if (valid.length > 1) this.moveSelection.show(t, [...new Set(valid)]);
                else if (valid.length === 1) this.performTokenMove(t, valid[0]);
                break;
            }
        }
    }

    performTokenMove(token, roll) {
        this.rollQueue.splice(this.rollQueue.indexOf(roll), 1);
        this.audio.playMove();

        const startSteps = token.steps;
        let endSteps = token.inHome ? 1 : startSteps + roll;

        if (token.inHome) {
            token.inHome = false;
            token.steps = 1;
            this.finishMove(token, 0, 1);
            return;
        }

        // Check if token crosses home entry junction
        const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
        let stopAtJunction = false, junctionStep = -1;

        for (let s = startSteps + 1; s <= endSteps; s++) {
            if (s === effectiveLapEnd) {
                stopAtJunction = true;
                junctionStep = s;
                break;
            }
        }

        if (stopAtJunction) {
            this.moveTokenSequentially(token, startSteps, junctionStep);
            token.steps = junctionStep;
            setTimeout(() => {
                const homeCoord = this.getCellPixel(HOME_STRETCHES[token.player][0][0], HOME_STRETCHES[token.player][0][1]);
                const nextLapIdx = (junctionStep + PLAYER_START_INDICES[token.player]) % 52;
                const lapCoord = this.getCellPixel(MAIN_PATH[nextLapIdx][0], MAIN_PATH[nextLapIdx][1]);
                this.junctionArrows.show(token, homeCoord, lapCoord);
                token.decisionPending = true;
                this.pendingMove = { rollRemaining: endSteps - junctionStep };
            }, junctionStep * 120 + 80);
        } else {
            this.finishMove(token, startSteps, endSteps);
        }
    }

    performJunctionMove(token, choice) {
        const rem = this.pendingMove.rollRemaining;
        const from = token.steps;

        if (choice === 'home') {
            token.steps = from + rem;
            this.moveTokenSequentially(token, from, token.steps);
        } else {
            token.lapCount = (token.lapCount || 0) + 1;
            token.steps = from + rem;
            this.moveTokenSequentially(token, from, token.steps);
        }
        setTimeout(() => this.postMoveLogic(token), rem * 120 + 80);
    }

    finishMove(token, from, to) {
        token.steps = to;
        this.moveTokenSequentially(token, from, to);
        setTimeout(() => this.postMoveLogic(token), (to - from) * 120 + 80);
    }

    moveTokenSequentially(token, from, to) {
        const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
        for (let s = from + 1; s <= to; s++) {
            let coord;
            if (s <= effectiveLapEnd) {
                const idx = (s - 1 + PLAYER_START_INDICES[token.player]) % 52;
                const [c, r] = MAIN_PATH[idx];
                coord = this.getCellPixel(c, r);
            } else {
                const homeStep = s - effectiveLapEnd;
                const hIdx = Math.min(5, homeStep);
                const [c, r] = HOME_STRETCHES[token.player][hIdx];
                coord = this.getCellPixel(c, r);
            }
            token.moveQueue.push(coord);
        }
    }

    postMoveLogic(token) {
        const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
        if (token.steps === effectiveLapEnd + 6) {
            token.finished = true;
            this.audio.playWin();
            this.spawnParticles(token.px, token.py, COLORS.GOLD, 40);
        }
        this.checkCollisions(token);
        this.updateTokenStacking();
        if (this.rollQueue.length === 0 || !this.canAnyMove()) this.nextTurn();
    }

    checkCollisions(movedToken) {
        const effectiveLapEnd = 51 + 52 * (movedToken.lapCount || 0);
        if (movedToken.steps > effectiveLapEnd) return; // No kills in home stretch
        const movedIdx = (movedToken.steps - 1 + PLAYER_START_INDICES[movedToken.player]) % 52;
        if (SAFE_INDICES.includes(movedIdx)) return; // Safe cell

        let killed = 0;
        this.tokens.forEach((pt, p) => {
            if (p === movedToken.player) return;
            pt.forEach(t => {
                const tEffectiveLapEnd = 51 + 52 * (t.lapCount || 0);
                if (!t.inHome && !t.finished && t.steps >= 1 && t.steps <= tEffectiveLapEnd) {
                    const tIdx = (t.steps - 1 + PLAYER_START_INDICES[t.player]) % 52;
                    if (tIdx === movedIdx) {
                        t.inHome = true; t.steps = 0; t.lapCount = 0;
                        const [hx, hy] = this.getCellPixel(HOME_POSITIONS[t.player][t.index][0], HOME_POSITIONS[t.player][t.index][1]);
                        t.px = hx; t.py = hy;
                        killed++;
                    }
                }
            });
        });

        if (killed > 0) {
            this.audio.playKill();
            this.spawnParticles(movedToken.px, movedToken.py, COLORS.RED, 30);
        }
    }

    updateTokenStacking() {
        const map = new Map();
        this.tokens.forEach(pt => pt.forEach(t => {
            if (t.inHome || t.finished) { t.offset = {x:0,y:0}; return; }
            const effectiveLapEnd = 51 + 52 * (t.lapCount || 0);
            const key = t.steps > effectiveLapEnd
                ? `H${t.player}-${t.steps - effectiveLapEnd + 51}`
                : `M${(t.steps - 1 + PLAYER_START_INDICES[t.player]) % 52}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(t);
        }));
        map.forEach(group => {
            if (group.length > 1) group.forEach((t, i) => {
                const a = (Math.PI * 2 * i) / group.length;
                t.offset = { x: Math.cos(a) * 9, y: Math.sin(a) * 9 };
            });
            else group[0].offset = {x:0,y:0};
        });
    }

    nextTurn() {
        this.rollQueue = [];
        // Spatial order: BL(Red=2) → TL(Green=0) → TR(Yellow=1) → BR(Blue=3)
        const order = [2, 0, 1, 3].filter(p => p < this.playerCount);
        const ci = order.indexOf(this.currentPlayer);
        this.currentPlayer = order[(ci + 1) % order.length];
        this.gameState = "roll";
        this.diceRolled = false;
        this.avatars.forEach((a, i) => a.active = i === this.currentPlayer);
    }

    // ─── WINNER SCREEN ───────────────────────────────────────────────
    drawWinnerScreen(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        ctx.fillStyle = '#2C0E4B';
        ctx.beginPath(); ctx.roundRect(60, 180, 360, 320, 24); ctx.fill();
        ctx.strokeStyle = COLORS.GOLD; ctx.lineWidth = 3; ctx.stroke();

        ctx.font = '56px Arial'; ctx.textAlign = 'center';
        ctx.fillText('🏆', SCREEN_W/2, 265);
        ctx.fillStyle = COLORS.GOLD; ctx.font = 'bold 28px Arial';
        ctx.fillText('WINNER!', SCREEN_W/2, 310);

        let winName = PLAYER_NAMES[this.winner || 0];
        if (this.teamUpMode) winName = TEAM_MAP[this.winner || 0] === 0 ? 'TEAM A 🟢🔴' : 'TEAM B 🟡🔵';
        ctx.fillStyle = COLORS.WHITE; ctx.font = 'bold 20px Arial';
        ctx.fillText(winName, SCREEN_W/2, 355);

        ctx.fillStyle = COLORS.GREEN;
        ctx.beginPath(); ctx.roundRect(SCREEN_W/2-70, 420, 140, 50, 14); ctx.fill();
        ctx.fillStyle = COLORS.WHITE; ctx.font = 'bold 18px Arial';
        ctx.fillText('Play Again', SCREEN_W/2, 451);
    }

    // ─── NETWORK SYNC METHODS ────────────────────────────────────────

    updateLobbyPlayers(players) {
        const list = document.getElementById('playersList');
        if (list) {
            list.innerHTML = '';
            players.forEach(p => {
                const li = document.createElement('li');
                li.style.color = p.online ? '#FFF' : '#888';
                li.innerText = `${p.name} (${PLAYER_NAMES[p.color].split(' ')[0]} Color) ${p.online ? '🟢' : '⚪'}`;
                list.appendChild(li);
                
                // Update local names if possible
                PLAYER_NAMES[p.color] = p.name;
                if (this.avatars[p.color]) {
                    this.avatars[p.color].name = p.name;
                    this.avatars[p.color].initials = p.name.substring(0, 2).toUpperCase();
                }
            });
        }
    }

    startGameFromServer(state) {
        document.getElementById('lobbyUI').style.display = 'none';
        this.syncState(state);
    }

    syncState(state) {
        this.gameState = state.gameState;
        this.currentPlayer = state.currentPlayer;
        this.rollQueue = [...state.rollQueue];
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
                
                // Snap position
                if (tv.inHome) {
                    const [hx, hy] = this.getCellPixel(HOME_POSITIONS[p][i][0], HOME_POSITIONS[p][i][1]);
                    tv.px = hx; tv.py = hy;
                } else if (tv.finished) {
                     // Keep them in center
                     const [cx, cy] = this.getCellPixel(7, 7);
                     tv.px = cx; tv.py = cy;
                } else {
                     // Calculate track position based on steps
                     const effectiveLapEnd = 51 + 52 * (tv.lapCount || 0);
                     if (tv.steps <= effectiveLapEnd) {
                         const idx = (tv.steps - 1 + PLAYER_START_INDICES[p]) % 52;
                         const [c, r] = MAIN_PATH[idx];
                         const [nx, ny] = this.getCellPixel(c, r);
                         tv.px = nx; tv.py = ny;
                     } else {
                         const homeStep = tv.steps - effectiveLapEnd;
                         const hIdx = Math.min(5, homeStep);
                         const [c, r] = HOME_STRETCHES[p][hIdx];
                         const [nx, ny] = this.getCellPixel(c, r);
                         tv.px = nx; tv.py = ny;
                     }
                }
            }
        }
        this.updateTokenStacking();
    }

    syncTimer(data) {
        this.currentPlayer = data.player;
        this.turnEndsAt = data.endsAt;
        this.turnDuration = data.duration;
    }

    playRemoteDiceRoll(val, player) {
        this.currentPlayer = player;
        this.dice.value = val;
        if (!this.dice.rolling) {
            this.dice.roll();
            this.audio.playDiceRoll();
        }
    }

    playRemoteTokenMove(player, index, toSteps, finishedInHome) {
        const token = this.tokens[player][index];
        const fromSteps = token.steps;
        if (finishedInHome) token.inHome = false;
        
        token.steps = toSteps;
        this.moveTokenSequentially(token, fromSteps, toSteps);
        this.audio.playMove();

        const delay = (toSteps - fromSteps) * 120 + 80;
        setTimeout(() => {
            this.updateTokenStacking();
        }, delay);
    }

    playKills(killedList) {
        killedList.forEach(k => {
            const t = this.tokens[k.player][k.index];
            t.inHome = true;
            t.steps = 0;
            t.lapCount = 0;
            const [hx, hy] = this.getCellPixel(HOME_POSITIONS[k.player][k.index][0], HOME_POSITIONS[k.player][k.index][1]);
            
            // simple visual teleport for kill
            t.px = hx; t.py = hy;
        });
        if (killedList.length > 0) {
            this.audio.playKill();
        }
    }

    showWinner(winnerIndex) {
        this.winner = winnerIndex;
        this.gameState = 'end';
        this.audio.playWin();
    }

    updatePeerVoiceStatus(sessionId, color, isMicOn) {
         if (color >= 0 && color < 4 && this.avatars[color]) {
             this.avatars[color].micOn = isMicOn;
         }
    }

    syncJunctionChoice(player, tokenIndex, remaining, atStep) {
        if (this.network && this.network.playerColor !== player) return; // Only show for the active player

        const token = this.tokens[player][tokenIndex];
        const homeCoord = this.getCellPixel(HOME_STRETCHES[player][0][0], HOME_STRETCHES[player][0][1]);
        const nextLapIdx = (atStep + PLAYER_START_INDICES[player]) % 52;
        const lapCoord = this.getCellPixel(MAIN_PATH[nextLapIdx][0], MAIN_PATH[nextLapIdx][1]);
        
        this.junctionArrows.show(token, homeCoord, lapCoord);
        token.decisionPending = true;
    }
}

// ─── UTILITY ─────────────────────────────────────────────────────────
function lightenColor(hex, amount) {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xFF) + amount);
    const b = Math.min(255, (num & 0xFF) + amount);
    return `rgb(${r},${g},${b})`;
}
