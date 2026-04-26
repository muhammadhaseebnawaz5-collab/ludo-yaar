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
        this.dataChannels = {}; // sessionId -> RTCDataChannel
        this.socketIds   = {}; // color -> socketId
        this.localStream = null;
        this.isMicOn     = false;

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
            console.log('WebSocket connected:', this.socket.id);
            const name = localStorage.getItem('ludoLastName') || 'Player';
            this._emitRegister(name);
        });

        this.socket.on('room-update', (data) => {
            data.players.forEach(p => {
                if (p.socketId) this.socketIds[p.color] = p.socketId;
            });
            this.game.updateLobbyPlayers(data.players);
        });

        this.socket.on('game-started', (state) => {
            if (this.game.gameState === 'lobby' || this.game.gameState === 'setup') {
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
            this.game.playRemoteTokenMove(data.player, data.index, data.toSteps, data.finishedInHome, data.lapCount);
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
            // WebSocket chat fallback
            this.game.chat.addMessage(data.message.sender, data.message.text, data.color);
        });

        this.socket.on('friend-invite', (data) => {
            if (typeof this.onFriendInvite === 'function') {
                this.onFriendInvite(data);
            }
        });

        this.socket.on('voice-signal', async ({ fromSocketId, signal }) => {
            if (!this.peers[fromSocketId]) {
                this.createPeerConnection(fromSocketId, false);
            }
            const pc = this.peers[fromSocketId];
            try {
                if (signal.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                    if (signal.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        this.socket.emit('voice-signal', { roomId: this.roomId, toSocketId: fromSocketId, signal: answer });
                    }
                } else if (signal.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal));
                }
            } catch(e) { console.error('Signaling error', e); }
        });

        this.socket.on('peer-voice-status', ({ sessionId, color, isMicOn }) => {
            this.game.updatePeerVoiceStatus(sessionId, color, isMicOn);
        });
    }

    registerUser(name) {
        localStorage.setItem('ludoLastName', name);
        this._emitRegister(name);
    }

    _emitRegister(name) {
        this.socket.emit('register-user', { uuid: this.userUUID, name });
    }

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

    startGame() {
        this.socket.emit('start-game', { roomId: this.roomId, sessionId: this.sessionId });
    }

    checkFriendsStatus(uuids, callback) {
        this.socket.emit('check-friends-status', { uuids }, (statuses) => {
            callback(statuses);
        });
    }

    inviteFriend(targetUUID, targetName, roomId) {
        const senderName  = localStorage.getItem('ludoLastName') || 'Someone';
        const senderColor = this.playerColor ?? 0;
        this.socket.emit('invite-friend', { targetUUID, senderName, senderColor, roomId });
    }

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
        // Try DataChannel first
        let sentViaDC = false;
        Object.keys(this.dataChannels).forEach(sid => {
            const dc = this.dataChannels[sid];
            if (dc.readyState === 'open') {
                dc.send(JSON.stringify({ type: 'chat', sender: senderName, text, color }));
                sentViaDC = true;
            }
        });

        // Always send via WebSocket as fallback/broadcast
        this.socket.emit('chat-message', { roomId: this.roomId, message: { sender: senderName, text }, color });
    }

    toggleBot(enabled) {
        this.socket.emit('toggle-bot', { roomId: this.roomId, sessionId: this.sessionId, enabled });
    }

    sendActivity() {
        if (this.roomId && this.sessionId) {
            this.socket.emit('player-activity', { roomId: this.roomId, sessionId: this.sessionId });
        }
    }

    async toggleMic() {
        if (!this.localStream) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.isMicOn = true;
                this.broadcastVoiceStatus();
                Object.values(this.socketIds).forEach(sid => {
                    if (sid !== this.socket.id && !this.peers[sid]) {
                        this.createPeerConnection(sid, true);
                    }
                });
            } catch(e) {
                console.error('Mic access denied', e);
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
        const pc = new RTCPeerConnection({ 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
                // { urls: 'turn:global.turn.twilio.com:3478', username: 'guest', credential: 'guest' }
            ] 
        });
        this.peers[targetSocketId] = pc;

        // Data Channel for Chat
        if (isInitiator) {
            const dc = pc.createDataChannel("chat");
            this.setupDataChannel(targetSocketId, dc);
        } else {
            pc.ondatachannel = (event) => {
                this.setupDataChannel(targetSocketId, event.channel);
            };
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('voice-signal', { roomId: this.roomId, toSocketId: targetSocketId, signal: event.candidate });
            }
        };

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
        }

        pc.ontrack = (event) => {
            console.log('Received remote audio track from', targetSocketId);
            const audio = new Audio();
            audio.srcObject = event.streams[0];
            audio.play().catch(e => console.warn('Audio play failed', e));
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`ICE Connection State [${targetSocketId}]: ${pc.iceConnectionState}`);
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection State [${targetSocketId}]: ${pc.connectionState}`);
        };

        if (isInitiator) {
            pc.createOffer().then(offer => pc.setLocalDescription(offer))
              .then(() => {
                  this.socket.emit('voice-signal', { roomId: this.roomId, toSocketId: targetSocketId, signal: pc.localDescription });
              });
        }
    }

    setupDataChannel(sid, dc) {
        this.dataChannels[sid] = dc;
        dc.onopen = () => console.log(`DataChannel [${sid}] is OPEN`);
        dc.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'chat') {
                this.game.chat.addMessage(data.sender, data.text, data.color);
            }
        };
        dc.onclose = () => console.log(`DataChannel [${sid}] is CLOSED`);
    }
}
