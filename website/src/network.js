import { io } from "socket.io-client";

export class NetworkManager {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.socket = io();

        this.roomId      = null;
        this.sessionId   = localStorage.getItem('ludoSessionId') || null;
        this.userUUID    = localStorage.getItem('ludoUserUUID')  || this._genUUID();
        this.playerColor = null;

        this.peers       = {};
        this.localStream = null;
        this.isMicOn     = false;

        /** Callback set by main.js for incoming friend invites */
        this.onFriendInvite = null;

        this.setupSocketEvents();
    }

    _genUUID() {
        const id = 'u-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        localStorage.setItem('ludoUserUUID', id);
        return id;
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            // Re-register on reconnect so server knows we're back
            const name = localStorage.getItem('ludoLastName') || 'Player';
            this._emitRegister(name);
        });

        this.socket.on('room-update', (data) => {
            this.game.updateLobbyPlayers(data.players);
        });

        this.socket.on('game-started', (state) => {
            if (this.game.gameState === 'lobby') {
                this.game.startGameFromServer(state);
            }
        });

        this.socket.on('state-update', (state) => {
            this.game.syncState(state);
        });

        this.socket.on('timer-sync', (data) => {
            this.game.syncTimer(data);
        });

        this.socket.on('dice-rolled', (data) => {
            this.game.playRemoteDiceRoll(data.value, data.byPlayer);
        });

        this.socket.on('token-moved', (data) => {
            this.game.playRemoteTokenMove(data.player, data.index, data.toSteps, data.finishedInHome);
        });

        this.socket.on('tokens-killed', ({ movedToken, killed }) => {
            this.game.playKills(killed);
        });

        this.socket.on('waiting-for-junction', ({ player, tokenIndex, remaining, atStep }) => {
            this.game.syncJunctionChoice(player, tokenIndex, remaining, atStep);
        });

        this.socket.on('game-over', (data) => {
            this.game.showWinner(data.winner);
        });

        this.socket.on('chat-message', (data) => {
            this.game.chat.addMessage(data.message.sender, data.message.text, data.color);
        });

        // ── Direct invite received ──
        this.socket.on('friend-invite', (data) => {
            if (typeof this.onFriendInvite === 'function') {
                this.onFriendInvite(data);
            }
        });

        // ── WebRTC Signaling ──
        this.socket.on('voice-signal', async ({ fromSocketId, signal }) => {
            if (!this.peers[fromSocketId]) {
                this.createPeerConnection(fromSocketId, false);
            }
            try {
                await this.peers[fromSocketId].setRemoteDescription(new RTCSessionDescription(signal));
                if (signal.type === 'offer') {
                    const answer = await this.peers[fromSocketId].createAnswer();
                    await this.peers[fromSocketId].setLocalDescription(answer);
                    this.socket.emit('voice-signal', { roomId: this.roomId, toSocketId: fromSocketId, signal: answer });
                }
            } catch(e) { console.error(e); }
        });

        this.socket.on('peer-voice-status', ({ sessionId, color, isMicOn }) => {
            this.game.updatePeerVoiceStatus(sessionId, color, isMicOn);
        });
    }

    // ── Register user globally (so they can receive invites) ──
    registerUser(name) {
        localStorage.setItem('ludoLastName', name);
        this._emitRegister(name);
    }

    _emitRegister(name) {
        this.socket.emit('register-user', { uuid: this.userUUID, name });
    }

    // ── Create Room ──
    createRoom(name, count, teamUpMode, callback) {
        this.socket.emit('create-room', { name, count, teamUpMode }, (res) => {
            if (res.success) {
                this.roomId      = res.roomId;
                this.sessionId   = res.sessionId;
                this.playerColor = res.playerColor;
                localStorage.setItem('ludoSessionId', this.sessionId);
                callback(res);
            }
        });
    }

    // ── Join Room ──
    joinRoom(roomId, name, callback) {
        this.socket.emit('join-room', { roomId, name, sessionId: this.sessionId }, (res) => {
            if (res.success) {
                this.roomId      = roomId;
                this.sessionId   = res.sessionId;
                this.playerColor = res.playerColor;
                localStorage.setItem('ludoSessionId', this.sessionId);
                callback(res);
            } else {
                callback(res);
            }
        });
    }

    // ── Start Game ──
    startGame() {
        this.socket.emit('start-game', { roomId: this.roomId, sessionId: this.sessionId });
    }

    // ── Check friends online status ──
    checkFriendsStatus(uuids, callback) {
        this.socket.emit('check-friends-status', { uuids }, (statuses) => {
            callback(statuses);
        });
    }

    // ── Invite a friend directly ──
    inviteFriend(targetUUID, targetName, roomId) {
        const senderName  = localStorage.getItem('ludoLastName') || 'Someone';
        const senderColor = this.playerColor ?? 0;
        this.socket.emit('invite-friend', { targetUUID, senderName, senderColor, roomId });
    }

    // ── Game Actions ──
    rollDice() {
        this.socket.emit('roll-dice', { roomId: this.roomId, sessionId: this.sessionId });
    }

    moveToken(tokenIndex, rollValue) {
        this.socket.emit('move-token', { roomId: this.roomId, sessionId: this.sessionId, tokenIndex, rollValue });
    }

    selectJunction(choice) {
        this.socket.emit('junction-choice', { roomId: this.roomId, sessionId: this.sessionId, choice });
    }

    sendChat(text, senderName, color) {
        this.socket.emit('chat-message', { roomId: this.roomId, message: { sender: senderName, text }, color });
    }

    // ── Voice ──
    async toggleMic() {
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                this.isMicOn = true;
                this.broadcastVoiceStatus();
            } catch(e) {
                console.error('Mic error', e);
                return false;
            }
        } else {
            this.isMicOn = !this.isMicOn;
            this.localStream.getAudioTracks()[0].enabled = this.isMicOn;
            this.broadcastVoiceStatus();
        }
        return this.isMicOn;
    }

    broadcastVoiceStatus() {
        this.socket.emit('voice-status', { roomId: this.roomId, sessionId: this.sessionId, isMicOn: this.isMicOn });
    }

    createPeerConnection(targetSocketId, isInitiator) {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        this.peers[targetSocketId] = pc;

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
        }

        pc.ontrack = (event) => {
            const audio = new Audio();
            audio.srcObject = event.streams[0];
            audio.play().catch(() => {});
        };

        if (isInitiator) {
            pc.createOffer().then(offer => pc.setLocalDescription(offer))
              .then(() => {
                  this.socket.emit('voice-signal', { roomId: this.roomId, toSocketId: targetSocketId, signal: pc.localDescription });
              });
        }
    }
}
