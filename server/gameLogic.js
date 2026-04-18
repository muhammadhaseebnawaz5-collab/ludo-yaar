import { MAIN_PATH, HOME_STRETCHES, PLAYER_START_INDICES, SAFE_INDICES, HOME_POSITIONS } from '../website/src/constants.js';

// Deep copy helper
function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
}

export class LudoRoom {
    constructor(roomId, options, broadcastCallback) {
        this.roomId = roomId;
        this.playerCount = options.playerCount || 4;
        this.teamUpMode = options.teamUpMode || false;
        this.broadcast = broadcastCallback;
        
        this.players = []; // { sessionId, name, colorIndex, socketId, isOnline }
        
        this.state = {
            tokens: Array.from({length: 4}, (_, p) => 
                Array.from({length: 4}, (_, i) => ({
                    player: p, index: i, steps: 0, 
                    finished: false, inHome: true, lapCount: 0
                }))
            ),
            currentPlayer: this.playerCount > 2 ? 0 : 0, // Start player
            rollQueue: [],
            gameState: 'lobby', // lobby -> roll -> move -> junction -> end
            pendingJunction: null, // { player, tokenIndex, remaining }
            winner: null
        };
        
        this.turnTimer = null;
        this.turnEndsAt = 0;
        this.turnDuration = 10000; // 10 seconds
    }

    joinPlayer(sessionId, name, socketId) {
        let player = this.players.find(p => p.sessionId === sessionId);
        if (player) {
            player.socketId = socketId;
            player.isOnline = true;
            player.name = name;
        } else {
            if (this.state.gameState !== 'lobby') return false; // Game already in progress
            if (this.players.length >= 4) return false;
            
            // Assign a color intelligently based on playerCount
            let colorMap = [0, 1, 2, 3];
            if (this.playerCount === 2) colorMap = [0, 2]; // opposite corners
            else if (this.playerCount === 3) colorMap = [0, 1, 2];
            
            let colorIndex = colorMap[this.players.length];
            if (colorIndex === undefined) return false;

            player = { sessionId, name, socketId, isOnline: true, colorIndex };
            this.players.push(player);
        }
        return player;
    }

    disconnectPlayer(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (player) {
            player.isOnline = false;
            player.socketId = null;
            // If it's their turn, the bot timer will still handle it
        }
    }

    startGame() {
        if (this.state.gameState !== 'lobby') return;
        this.state.currentPlayer = this.players[0].colorIndex;
        this.state.gameState = 'roll';
        this.broadcast('game-started', this.state);
        this.startTurnTimer();
    }

    startTurnTimer() {
        clearTimeout(this.turnTimer);
        this.turnEndsAt = Date.now() + this.turnDuration;
        this.broadcast('timer-sync', { endsAt: this.turnEndsAt, duration: this.turnDuration, player: this.state.currentPlayer });

        const currentPlayerObj = this.players.find(p => p.colorIndex === this.state.currentPlayer);
        let timeToWait = this.turnDuration;
        
        // If offline, auto-play faster (e.g., 1.5 seconds)
        if (!currentPlayerObj || !currentPlayerObj.isOnline) {
            timeToWait = 1500;
        }

        this.turnTimer = setTimeout(() => {
            if (this.state.gameState === 'junction') {
                // Auto-choose HOME if they timeout
                this.handleJunctionChoice(currentPlayerObj.sessionId, 'home');
            } else {
                this.autoPlayTurn();
            }
        }, timeToWait);
    }

    nextTurn() {
        this.state.rollQueue = [];
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
        let pIndex = this.state.currentPlayer;
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
        if (this.state.gameState !== 'roll') return;

        this.executeRoll();
    }

    executeRoll() {
        clearTimeout(this.turnTimer); // Stop timer while animating/calculating
        const val = Math.floor(Math.random() * 6) + 1;
        
        this.broadcast('dice-rolled', { value: val, byPlayer: this.state.currentPlayer });

        setTimeout(() => {
            this.state.rollQueue.push(val);
            const sixCount = this.state.rollQueue.filter(v => v === 6).length;
            
            if (sixCount === 3) {
                // Triple 6, loose turn
                this.nextTurn();
            } else if (val === 6) {
                // Keep rolling
                this.startTurnTimer();
            } else {
                this.state.gameState = "move";
                if (!this.canAnyMove()) {
                    setTimeout(() => this.nextTurn(), 800);
                } else {
                    this.broadcast('state-update', this.state);
                    this.startTurnTimer();
                }
            }
        }, 600); // Wait for dice animation client-side
    }

    handleMoveToken(sessionId, tokenIndex, rollValue) {
        const player = this.players.find(p => p.sessionId === sessionId);
        if (!player || player.colorIndex !== this.state.currentPlayer) return;
        if (this.state.gameState !== 'move') return;

        const token = this.state.tokens[player.colorIndex][tokenIndex];
        if (!token) return;
        
        if (!this.state.rollQueue.includes(rollValue) || !this.canTokenMove(token, rollValue)) return;

        this.executeMove(token, rollValue);
    }

    executeMove(token, rollValue) {
        clearTimeout(this.turnTimer); // Wait until move is done
        
        // consume roll
        const rIndex = this.state.rollQueue.indexOf(rollValue);
        if (rIndex > -1) this.state.rollQueue.splice(rIndex, 1);

        const startSteps = token.steps;
        let endSteps = token.inHome ? 1 : startSteps + rollValue;

        if (token.inHome) {
            token.inHome = false;
            token.steps = 1;
            this.finalizeMove(token, startSteps, endSteps);
            return;
        }

        const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
        // endSteps is already calculated correctly on line 187 for the non-inHome case.


        // --- JUNCTION DETECTION (SCENARIO B) ---
        if (startSteps < effectiveLapEnd && endSteps >= effectiveLapEnd) {
            // Move it to the junction first
            token.steps = effectiveLapEnd;
            this.state.gameState = 'junction';
            this.state.pendingJunction = {
                player: token.player,
                tokenIndex: token.index,
                remainingSteps: endSteps - effectiveLapEnd
            };

            this.broadcast('waiting-for-junction', {
                player: token.player,
                tokenIndex: token.index,
                remaining: endSteps - effectiveLapEnd,
                atStep: effectiveLapEnd
            });

            // Start move animation to junction on clients
            this.broadcast('token-moved', {
                player: token.player, index: token.index, toSteps: effectiveLapEnd,
                finishedInHome: false
            });

            // Timer for the decision
            this.startTurnTimer();
        } else {
            token.steps = endSteps;
            this.finalizeMove(token, startSteps, endSteps);
        }
    }

    handleJunctionChoice(sessionId, choice) {
        const player = this.players.find(p => p.sessionId === sessionId);
        if (!player || player.colorIndex !== this.state.currentPlayer) return;
        if (this.state.gameState !== 'junction' || !this.state.pendingJunction) return;

        const { player: pIdx, tokenIndex, remainingSteps } = this.state.pendingJunction;
        const token = this.state.tokens[pIdx][tokenIndex];
        const prevSteps = token.steps;

        clearTimeout(this.turnTimer);

        if (choice === 'lap') {
            token.lapCount = (token.lapCount || 0) + 1;
        }
        
        token.steps += remainingSteps;
        this.state.pendingJunction = null;
        this.state.gameState = 'move'; // Temp state to finish finalizeMove

        this.finalizeMove(token, prevSteps, token.steps);
    }

    finalizeMove(token, startSteps, endSteps) {
        this.broadcast('token-moved', {
            player: token.player, index: token.index, toSteps: endSteps,
            finishedInHome: !token.inHome && startSteps === 0
        });

        // calculate collision
        setTimeout(() => {
            const effectiveLapEnd = 51 + 52 * (token.lapCount || 0);
            let justFinished = false;
            
            if (token.steps === effectiveLapEnd + 6) {
                token.finished = true;
                justFinished = true;
            } else {
                this.checkCollisions(token);
            }

            // check win condition
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
        }, (endSteps - startSteps) * 120 + 200);
    }

    checkCollisions(movedToken) {
        const effectiveLapEnd = 51 + 52 * (movedToken.lapCount || 0);
        if (movedToken.steps > effectiveLapEnd) return; // in stretch
        
        const movedIdx = (movedToken.steps - 1 + PLAYER_START_INDICES[movedToken.player]) % 52;
        if (SAFE_INDICES.includes(movedIdx)) return;

        let killedTokens = [];
        for (let p = 0; p < 4; p++) {
            if (p === movedToken.player) continue;
            
            for (let i = 0; i < 4; i++) {
                let t = this.state.tokens[p][i];
                let tLapEnd = 51 + 52 * (t.lapCount || 0);
                if (!t.inHome && !t.finished && t.steps >= 1 && t.steps <= tLapEnd) {
                    const tIdx = (t.steps - 1 + PLAYER_START_INDICES[t.player]) % 52;
                    if (tIdx === movedIdx) {
                        t.inHome = true; t.steps = 0; t.lapCount = 0;
                        killedTokens.push({ player: t.player, index: t.index });
                    }
                }
            }
        }

        if (killedTokens.length > 0) {
            this.broadcast('tokens-killed', { movedToken, killed: killedTokens });
            // Should get bonus turn or roll queue logic? Standard ludo rules often give "another roll" but we will just stick to current rollQueue.
        }
    }

    autoPlayTurn() {
        if (this.state.gameState === 'roll') {
            this.executeRoll();
        } else if (this.state.gameState === 'move') {
            // Find a valid move
            const pIdx = this.state.currentPlayer;
            let possibleMoves = [];
            
            for (const t of this.state.tokens[pIdx]) {
                for (const r of this.state.rollQueue) {
                    if (this.canTokenMove(t, r)) {
                        possibleMoves.push({ token: t, roll: r });
                    }
                }
            }

            if (possibleMoves.length > 0) {
                const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                this.executeMove(move.token, move.roll);
            } else {
                this.nextTurn();
            }
        }
    }
}
