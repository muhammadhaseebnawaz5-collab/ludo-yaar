import { MAIN_PATH, HOME_STRETCHES, PLAYER_START_INDICES, SAFE_INDICES, HOME_POSITIONS } from '../website/src/constants.js';

export class LudoRoom {
    constructor(roomId, options, broadcastCallback) {
        this.roomId = roomId;
        this.playerCount = options.playerCount || 4;
        this.teamUpMode = options.teamUpMode || false;
        this.broadcast = broadcastCallback;
        
        this.players = [];
        
        this.state = {
            tokens: Array.from({length: 4}, (_, p) => 
                Array.from({length: 4}, (_, i) => ({
                    player: p, index: i, steps: 0, 
                    finished: false, inHome: true, lapCount: 0
                }))
            ),
            currentPlayer: 0,
            rollQueue: [],
            gameState: 'lobby',
            pendingJunction: null,
            winner: null,
            playerCount: this.playerCount
        };
        
        this.turnTimer = null;
        this.transitionTimer = null; // New timer for animation delays
        this.turnEndsAt = 0;
        this.turnDuration = 30000;
    }

    joinPlayer(sessionId, name, socketId) {
        let player = this.players.find(p => p.sessionId === sessionId);
        if (player) {
            player.socketId = socketId;
            player.isOnline = true;
            player.name = name;
            player.botEnabled = false; // Reset bot mode on reconnect
        } else {
            if (this.state.gameState !== 'lobby') return false;
            if (this.players.length >= 4) return false;
            
            let colorMap = [0, 1, 2, 3];
            if (this.playerCount === 2) colorMap = [0, 2];
            else if (this.playerCount === 3) colorMap = [0, 1, 2];
            
            let colorIndex = colorMap[this.players.length];
            if (colorIndex === undefined) return false;

            player = { 
                sessionId, name, socketId, isOnline: true, colorIndex, 
                botEnabled: false, lastActivityAt: Date.now() 
            };
            this.players.push(player);
        }
        return player;
    }

    disconnectPlayer(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (player) {
            player.isOnline = false;
            player.socketId = null;
            player.botEnabled = true;
            this.broadcast('state-update', this.state);
            this.broadcastRoomUpdate();
        }
    }

    startGame() {
        if (this.state.gameState !== 'lobby') return;

        let colorMap = [0, 1, 2, 3];
        if (this.playerCount === 2) colorMap = [0, 2];
        else if (this.playerCount === 3) colorMap = [0, 1, 2];

        colorMap.forEach(color => {
            if (!this.players.find(p => p.colorIndex === color)) {
                this.players.push({
                    sessionId: 'bot-' + color,
                    name: 'Computer ' + (color + 1),
                    socketId: null,
                    isOnline: false,
                    colorIndex: color,
                    botEnabled: true
                });
            }
        });

        this.state.currentPlayer = this.players[0].colorIndex;
        this.state.gameState = 'roll';
        this.broadcast('game-started', this.state);
        this.broadcastRoomUpdate();
        this.startTurnTimer();
    }

    broadcastRoomUpdate() {
        this.broadcast('room-update', { 
            players: this.players.map(p => ({
                name: p.name, 
                color: p.colorIndex, 
                online: p.isOnline, 
                botEnabled: p.botEnabled,
                socketId: p.socketId
            })) 
        });
    }

    startTurnTimer() {
        clearTimeout(this.turnTimer);
        this.turnEndsAt = Date.now() + this.turnDuration;
        this.broadcast('timer-sync', { 
            endsAt: this.turnEndsAt, 
            duration: this.turnDuration, 
            player: this.state.currentPlayer 
        });

        const currentPlayerObj = this.players.find(p => p.colorIndex === this.state.currentPlayer);
        let timeToWait = this.turnDuration;
        
        if (!currentPlayerObj || currentPlayerObj.botEnabled) {
            timeToWait = 1500;
        }

        this.turnTimer = setTimeout(() => {
            const player = this.players.find(p => p.colorIndex === this.state.currentPlayer);
            if (player && !player.botEnabled && player.isOnline) {
                const inactiveTime = Date.now() - (player.lastActivityAt || 0);
                if (inactiveTime < this.turnDuration - 500) {
                    // Player was active recently, just restart the timer
                    this.startTurnTimer();
                    return;
                }
            }

            if (this.state.gameState === 'junction') {
                const botPlayer = this.players.find(p => p.colorIndex === this.state.currentPlayer);
                if (botPlayer) this.handleJunctionChoice(botPlayer.sessionId, 'home');
            } else {
                this.autoPlayTurn();
            }
        }, timeToWait);
    }

    nextTurn() {
        this.state.rollQueue = [];
        this.state.pendingJunction = null;
        
        let order;
        if (this.playerCount === 2) order = [0, 2];
        else if (this.playerCount === 3) order = [0, 1, 2];
        else order = [0, 1, 2, 3];
        
        const ci = order.indexOf(this.state.currentPlayer);
        this.state.currentPlayer = order[(ci + 1) % order.length];
        this.state.gameState = "roll";
        
        this.broadcast('state-update', this.state);
        this.startTurnTimer();
    }

    canAnyMove() {
        const pIndex = this.state.currentPlayer;
        const pts = this.state.tokens[pIndex];
        return pts.some(t => this.state.rollQueue.some(r => this.canTokenMove(t, r)));
    }

    canTokenMove(token, roll) {
        if (token.finished) return false;
        if (token.inHome) return roll === 6;
        const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
        const maxSteps = effectiveLapEnd + 6;
        if (token.steps + roll > maxSteps) return false;
        return true;
    }

    handleRollDice(sessionId) {
        const player = this.players.find(p => p.sessionId === sessionId);
        if (!player || player.colorIndex !== this.state.currentPlayer) return;

        if (player.botEnabled) {
            player.botEnabled = false;
            this.broadcastRoomUpdate();
        }
        player.lastActivityAt = Date.now();

        clearTimeout(this.transitionTimer);
        if (this.state.gameState !== 'roll') return;
        this.executeRoll();
    }

    executeRoll() {
        clearTimeout(this.turnTimer);
        clearTimeout(this.transitionTimer);
        const val = Math.floor(Math.random() * 6) + 1;
        
        this.broadcast('dice-rolled', { value: val, byPlayer: this.state.currentPlayer });

        this.transitionTimer = setTimeout(() => {
            this.state.rollQueue.push(val);
            const sixCount = this.state.rollQueue.filter(v => v === 6).length;
            
            if (sixCount >= 3) {
                // FIX: Teen 6 = rollQueue clear karke turn end
                this.state.rollQueue = [];
                this.nextTurn();
                return;
            }
            
            if (val === 6) {
                // FIX: 6 aaya = "roll" state rehti hai, move bhi ho sakta hai (6 queue mein hai)
                this.state.gameState = "roll";
                this.broadcast('state-update', this.state);
                this.startTurnTimer();
                return;
            }

            // Normal roll = move phase
            this.state.gameState = "move";
            
            if (!this.canAnyMove()) {
                setTimeout(() => this.nextTurn(), 800);
            } else {
                this.broadcast('state-update', this.state);
                this.startTurnTimer();
            }
        }, 650); // Slightly more than 600ms to be safe
    }

    handleMoveToken(sessionId, tokenIndex, rollValue) {
        const player = this.players.find(p => p.sessionId === sessionId);
        if (!player || player.colorIndex !== this.state.currentPlayer) return;

        if (player.botEnabled) {
            player.botEnabled = false;
            this.broadcastRoomUpdate();
        }
        player.lastActivityAt = Date.now();

        clearTimeout(this.transitionTimer);
        if (this.state.gameState !== 'move') return;

        const token = this.state.tokens[player.colorIndex][tokenIndex];
        if (!token) return;
        
        if (!this.state.rollQueue.includes(rollValue) || !this.canTokenMove(token, rollValue)) return;

        this.executeMove(token, rollValue);
    }

    executeMove(token, rollValue) {
        clearTimeout(this.turnTimer);
        
        // Consume roll
        const rIndex = this.state.rollQueue.indexOf(rollValue);
        if (rIndex > -1) this.state.rollQueue.splice(rIndex, 1);

        const startSteps = token.steps;

        if (token.inHome) {
            token.inHome = false;
            token.steps = 1;
            this.broadcast('token-moved', {
                player: token.player, index: token.index, toSteps: 1,
                finishedInHome: true
            });
            this.transitionTimer = setTimeout(() => this.finalizeMove(token, 0, 1), 250);
            return;
        }

        const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
        const endSteps = startSteps + rollValue;

        // FIX: Junction detection — sirf tab jab token actually cross karta hai
        if (startSteps < effectiveLapEnd && endSteps >= effectiveLapEnd) {
            const stepsRemaining = endSteps - effectiveLapEnd;
            
            token.steps = effectiveLapEnd;
            this.state.gameState = 'junction';
            this.state.pendingJunction = {
                player: token.player,
                tokenIndex: token.index,
                remainingSteps: stepsRemaining
            };

            // Client ko junction tak move animation dikhao
            this.broadcast('token-moved', {
                player: token.player, index: token.index, toSteps: effectiveLapEnd,
                finishedInHome: false
            });

            // FIX: atStep bhi bhejo taake client path calculate kar sake
            this.broadcast('waiting-for-junction', {
                player: token.player,
                tokenIndex: token.index,
                remaining: stepsRemaining,
                atStep: effectiveLapEnd
            });

            this.startTurnTimer();
        } else {
            token.steps = endSteps;
            // First broadcast movement, then finalize
            this.broadcast('token-moved', {
                player: token.player, index: token.index, toSteps: endSteps,
                finishedInHome: false
            });
            const delay = (endSteps - startSteps) * 125 + 150;
            this.transitionTimer = setTimeout(() => this.finalizeMove(token, startSteps, endSteps), delay);
        }
    }

    handleJunctionChoice(sessionId, choice) {
        const player = this.players.find(p => p.sessionId === sessionId);
        if (!player || player.colorIndex !== this.state.currentPlayer) return;

        if (player.botEnabled) {
            player.botEnabled = false;
            this.broadcastRoomUpdate();
        }
        player.lastActivityAt = Date.now();

        clearTimeout(this.transitionTimer);
        if (this.state.gameState !== 'junction' || !this.state.pendingJunction) return;

        const { player: pIdx, tokenIndex, remainingSteps } = this.state.pendingJunction;
        const token = this.state.tokens[pIdx][tokenIndex];
        const prevSteps = token.steps;

        clearTimeout(this.turnTimer);

        if (choice === 'lap') {
            // FIX: lapCount pehle badhao
            token.lapCount = (token.lapCount || 0) + 1;
        }
        
        token.steps += remainingSteps;
        this.state.pendingJunction = null;
        this.state.gameState = 'move';

        // Broadcast the remaining movement
        this.broadcast('token-moved', {
            player: token.player, index: token.index, toSteps: token.steps,
            finishedInHome: false,
            lapCount: token.lapCount
        });

        const delay = remainingSteps * 125 + 150;
        this.transitionTimer = setTimeout(() => this.finalizeMove(token, prevSteps, token.steps), delay);
    }

    finalizeMove(token, startSteps, endSteps) {
        // FIX: effectiveLapEnd token ki CURRENT lapCount se (jo update ho chuka hai)
        const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
        
        if (token.steps >= effectiveLapEnd + 6) {
            token.finished = true;
            token.steps = effectiveLapEnd + 6; // clamp
        } else {
            this.checkCollisions(token);
        }

        // Check win condition
        if (this.state.tokens[token.player].every(t => t.finished)) {
            this.state.winner = token.player;
            this.state.gameState = 'end';
            this.broadcast('game-over', { winner: token.player });
            return;
        }

        if (this.state.rollQueue.length === 0 || !this.canAnyMove()) {
            this.nextTurn();
        } else {
            this.broadcast('state-update', this.state);
            this.startTurnTimer();
        }
    }

    checkCollisions(movedToken) {
        const effectiveLapEnd = 51 + 52 * (movedToken.lapCount || 0);
        if (movedToken.steps > effectiveLapEnd) return; // Home stretch — safe

        const movedIdx = (movedToken.steps - 1 + PLAYER_START_INDICES[movedToken.player]) % 52;
        if (SAFE_INDICES.includes(movedIdx)) return; // Safe cell

        // Saare enemy tokens jo same board index pe hain
        let enemiesOnCell = [];
        for (let p = 0; p < 4; p++) {
            if (p === movedToken.player) continue;
            
            for (let i = 0; i < 4; i++) {
                const t = this.state.tokens[p][i];
                const tLapEnd = 51 + 52 * (t.lapCount || 0);
                if (!t.inHome && !t.finished && t.steps >= 1 && t.steps <= tLapEnd) {
                    const tIdx = (t.steps - 1 + PLAYER_START_INDICES[t.player]) % 52;
                    if (tIdx === movedIdx) {
                        enemiesOnCell.push(t);
                    }
                }
            }
        }

        if (enemiesOnCell.length === 0) return;

        // FIX: 1 ya 2+ tokens — sab kill karo (2 tokens = both go home)
        const killed = [];
        enemiesOnCell.forEach(t => {
            t.inHome = true;
            t.steps = 0;
            t.lapCount = 0;
            killed.push({ player: t.player, index: t.index });
        });

        if (killed.length > 0) {
            this.broadcast('tokens-killed', { 
                movedToken: { player: movedToken.player, index: movedToken.index },
                killed 
            });
        }
    }

    autoPlayTurn() {
        const player = this.players.find(p => p.colorIndex === this.state.currentPlayer);
        if (player && !player.botEnabled) {
            player.botEnabled = true;
            this.broadcastRoomUpdate();
        }

        if (this.state.gameState === 'roll') {
            this.executeRoll();
            return;
        }
        
        if (this.state.gameState === 'move') {
            // FIX: SIRF current player ke tokens
            const pIdx = this.state.currentPlayer;
            const playerTokens = this.state.tokens[pIdx];
            let possibleMoves = [];
            
            for (const t of playerTokens) {
                for (const r of this.state.rollQueue) {
                    if (this.canTokenMove(t, r)) {
                        possibleMoves.push({ token: t, roll: r });
                    }
                }
            }

            if (possibleMoves.length > 0) {
                // Priority: ghar se nikalna > board pe chalana
                const homeMove = possibleMoves.find(m => m.token.inHome);
                const move = homeMove || possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                this.executeMove(move.token, move.roll);
            } else {
                this.nextTurn();
            }
            return;
        }
        
        if (this.state.gameState === 'junction') {
            const botPlayer = this.players.find(p => p.colorIndex === this.state.currentPlayer);
            if (botPlayer) this.handleJunctionChoice(botPlayer.sessionId, 'home');
        }
    }

    handleToggleBot(sessionId, enabled) {
        const player = this.players.find(p => p.sessionId === sessionId);
        if (player) {
            player.botEnabled = enabled;
            if (enabled && this.state.currentPlayer === player.colorIndex) {
                this.startTurnTimer();
            }
            this.broadcastRoomUpdate();
        }
    }
    
    handlePlayerActivity(sessionId) {
        const player = this.players.find(p => p.sessionId === sessionId);
        if (player && player.colorIndex === this.state.currentPlayer) {
            player.lastActivityAt = Date.now();
            // Optional: We don't necessarily need to call startTurnTimer() here
            // since the timer callback itself now checks lastActivityAt
        }
    }
}
