export class NetworkManager {
  constructor(gameInstance) {
    this.game = gameInstance;

    // Use the global 'io' from the CDN script in index.html
    if (typeof io !== "undefined") {
      // In development, connect to localhost:3000; in production, use same origin
      const socketUrl =
        process.env.NODE_ENV === "development"
          ? "http://localhost:3000"
          : window.location.origin;
      console.log("🔌 Attempting to connect to socket server:", socketUrl);
      this.socket = io(socketUrl);
      this.setupSocketEvents();
    } else {
      console.error(
        "❌ Socket.io not found! The game will not be able to connect to the server. Make sure the CDN script is loaded.",
      );
    }

    this.roomId = localStorage.getItem("ludoRoomId") || null;
    this.sessionId = localStorage.getItem("ludoSessionId") || null;
    this.userUUID = localStorage.getItem("ludoUserUUID") || this._genUUID();
    this.playerColor = null;

    this.peers = {};
    this.dataChannels = {}; // sessionId -> RTCDataChannel
    this.remoteAudioEls = {}; // socketId -> HTMLAudioElement
    this.socketIds = {}; // color -> socketId
    this.socketIdColors = {}; // socketId -> color
    this.localStream = null;
    this.isMicOn = false;
    this.globalSpeakerEnabled = true;
    this.mutedPlayerColors = new Set();

    this.onFriendInvite = null;
    this.onAutoRejoin = null; // callback for auto-rejoin attempts

    this.setupSocketEvents();
  }

  _genUUID() {
    const id =
      "u-" +
      Math.random().toString(36).substring(2, 10) +
      Date.now().toString(36);
    localStorage.setItem("ludoUserUUID", id);
    return id;
  }

  setupSocketEvents() {
    this.socket.on("connect", () => {
      console.log("✅ WebSocket connected:", this.socket.id);
      const name = localStorage.getItem("ludoLastName") || "Player";
      this._emitRegister(name);

      // Auto-rejoin if we have stored session and room
      if (this.roomId && this.sessionId) {
        this.attemptAutoRejoin(name);
      }
    });

    this.socket.on("disconnect", () => {
      console.log("❌ WebSocket disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ WebSocket connection error:", error);
    });

    this.socket.on("room-update", (data) => {
      this.socketIds = {};
      this.socketIdColors = {};
      data.players.forEach((p) => {
        if (p.socketId) {
          this.socketIds[p.color] = p.socketId;
          this.socketIdColors[p.socketId] = p.color;
        }
      });
      this.applyRemoteAudioMuteStates();
      this.game.updateLobbyPlayers(data);
    });

    this.socket.on("game-started", (state) => {
      if (this.game.gameState === "lobby" || this.game.gameState === "setup") {
        this.game.startGameFromServer(state);
      }
    });

    this.socket.on("state-update", (state) => {
      this.game.syncState(state);
    });

    this.socket.on("timer-sync", (data) => {
      this.game.syncTimer(data);
    });

    this.socket.on("dice-rolled", (data) => {
      this.game.playRemoteDiceRoll(data.value, data.byPlayer, data.id);
    });

    this.socket.on("token-moved", (data) => {
      this.game.playRemoteTokenMove(
        data.player,
        data.index,
        data.toSteps,
        data.finishedInHome,
        data.lapCount,
      );
    });

    this.socket.on("tokens-killed", ({ movedToken, killed }) => {
      this.game.playKills(killed);
    });

    this.socket.on(
      "waiting-for-junction",
      ({ player, tokenIndex, remaining, atStep }) => {
        this.game.syncJunctionChoice(player, tokenIndex, remaining, atStep);
      },
    );

    this.socket.on("game-over", (data) => {
      this.game.showWinner(data.winner);
    });

    this.socket.on("player-reconnected", (data) => {
      this.game.showPlayerReconnected(data.playerColor, data.playerName);
    });

    this.socket.on("chat-message", (data) => {
      if (data.message.senderId && data.message.senderId === this.sessionId)
        return;
      // WebSocket chat fallback
      this.game.chat.addMessage(
        data.message.sender,
        data.message.text,
        data.message.color,
      );
      const senderPlayerId = Number.isInteger(data.message.playerId)
        ? data.message.playerId
        : data.message.sender;
      this.game.showAvatarMessage(senderPlayerId, data.message.text);
    });

    this.socket.on("friend-invite", (data) => {
      if (typeof this.onFriendInvite === "function") {
        this.onFriendInvite(data);
      }
    });

    this.socket.on("voice-signal", async ({ fromSocketId, signal }) => {
      if (!fromSocketId || fromSocketId === this.socket.id) return;
      if (!this.peers[fromSocketId]) {
        this.createPeerConnection(fromSocketId, false);
      }
      const pc = this.peers[fromSocketId];
      try {
        if (signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          if (signal.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.socket.emit("voice-signal", {
              roomId: this.roomId,
              toSocketId: fromSocketId,
              signal: answer,
            });
          }
        } else if (signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal));
        }
      } catch (e) {
        console.error("Signaling error", e);
      }
    });

    this.socket.on("peer-voice-status", ({ sessionId, color, isMicOn }) => {
      this.game.updatePeerVoiceStatus(sessionId, color, isMicOn);
    });
  }

  registerUser(name) {
    localStorage.setItem("ludoLastName", name);
    this._emitRegister(name);
  }

  _emitRegister(name) {
    this.socket.emit("register-user", { uuid: this.userUUID, name });
  }

  attemptAutoRejoin(name) {
    console.log(
      `Attempting auto-rejoin to room ${this.roomId} with session ${this.sessionId}`,
    );
    this.socket.emit(
      "join-room",
      { roomId: this.roomId, name, sessionId: this.sessionId },
      (res) => {
        if (res.success) {
          console.log("Auto-rejoin successful");
          this.playerColor = res.playerColor;
          // Notify the UI about successful rejoin
          if (typeof this.onAutoRejoin === "function") {
            this.onAutoRejoin(res);
          }
        } else {
          console.log("Auto-rejoin failed:", res.error);
          // Clear stored session data if rejoin fails
          this.clearStoredSession();
        }
      },
    );
  }

  clearStoredSession() {
    localStorage.removeItem("ludoRoomId");
    localStorage.removeItem("ludoSessionId");
    this.roomId = null;
    this.sessionId = null;
  }

  leaveRoom() {
    // Notify server to leave the current room
    if (this.roomId) {
      this.socket.emit("leave-room", {
        roomId: this.roomId,
        sessionId: this.sessionId,
      });
    }
    this.clearStoredSession();
  }

  createRoom(name, count, teamUpMode, callback) {
    if (!this.socket || !this.socket.connected) {
      callback({
        success: false,
        error: "Server se connection nahi hai. Reload karein.",
      });
      return;
    }

    this.socket.emit("create-room", { name, count, teamUpMode }, (res) => {
      if (res.success) {
        this.roomId = res.roomId;
        this.sessionId = res.sessionId;
        this.playerColor = res.playerColor;
        localStorage.setItem("ludoRoomId", this.roomId);
        localStorage.setItem("ludoSessionId", this.sessionId);
      }
      callback(res);
    });
  }

  joinRoom(roomId, name, callback) {
    this.socket.emit(
      "join-room",
      { roomId, name, sessionId: this.sessionId },
      (res) => {
        if (res.success) {
          this.roomId = roomId;
          this.sessionId = res.sessionId;
          this.playerColor = res.playerColor;
          localStorage.setItem("ludoRoomId", this.roomId);
          localStorage.setItem("ludoSessionId", this.sessionId);
          callback(res);
        } else {
          callback(res);
        }
      },
    );
  }

  startGame() {
    this.socket.emit("start-game", {
      roomId: this.roomId,
      sessionId: this.sessionId,
    });
  }

  checkFriendsStatus(uuids, callback) {
    this.socket.emit("check-friends-status", { uuids }, (statuses) => {
      callback(statuses);
    });
  }

  inviteFriend(targetUUID, targetName, roomId) {
    const senderName = localStorage.getItem("ludoLastName") || "Someone";
    const senderColor = this.playerColor ?? 0;
    this.socket.emit("invite-friend", {
      targetUUID,
      senderName,
      senderColor,
      roomId,
    });
  }

  rollDice() {
    this.socket.emit(
      "roll-dice",
      {
        roomId: this.roomId,
        sessionId: this.sessionId,
      },
      (res) => {
        if (!res?.success) {
          console.warn("Dice roll rejected by server:", res?.error || res);
        }
      },
    );
  }

  moveToken(tokenIndex, rollValue) {
    this.socket.emit("move-token", {
      roomId: this.roomId,
      sessionId: this.sessionId,
      tokenIndex,
      rollValue,
    });
  }

  selectJunction(choice) {
    this.socket.emit("junction-choice", {
      roomId: this.roomId,
      sessionId: this.sessionId,
      choice,
    });
  }

  sendChat(text, senderName, color) {
    const messageObj = {
      senderId: this.sessionId,
      playerId: this.playerColor,
      playerColor: color,
      sender: senderName,
      text,
      timestamp: Date.now(),
      color,
    };

    // Chat and emoji UI sync must go through the server so every POV receives
    // the same player id and can render the bubble on its own layout.
    this.socket.emit("chat-message", {
      roomId: this.roomId,
      message: messageObj,
    });
  }

  toggleBot(enabled) {
    this.socket.emit("toggle-bot", {
      roomId: this.roomId,
      sessionId: this.sessionId,
      enabled,
    });
  }

  sendActivity() {
    if (this.roomId && this.sessionId) {
      this.socket.emit("player-activity", {
        roomId: this.roomId,
        sessionId: this.sessionId,
      });
    }
  }

  async toggleMic() {
    if (!this.localStream) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });

        // FIX: never play your own audio
        const localAudio = new Audio();
        localAudio.srcObject = this.localStream;
        localAudio.muted = true;
        localAudio.autoplay = true;
        localAudio.playsInline = true;
        this._localMutedAudioEl = localAudio;

        this.isMicOn = true;
        this.broadcastVoiceStatus();
        this.addLocalTracksToPeers();
        Object.values(this.socketIds).forEach((sid) => {
          if (sid !== this.socket.id && !this.peers[sid]) {
            this.createPeerConnection(sid, true);
          }
        });
      } catch (e) {
        console.error("Mic access denied", e);
        return false;
      }
    } else {
      this.isMicOn = !this.isMicOn;
      this.localStream.getAudioTracks()[0].enabled = this.isMicOn;

      if (this._localMutedAudioEl) {
        this._localMutedAudioEl.muted = true;
        this._localMutedAudioEl.volume = 0;
      }

      this.broadcastVoiceStatus();
    }
    return this.isMicOn;
  }

  broadcastVoiceStatus() {
    this.socket.emit("voice-status", {
      roomId: this.roomId,
      sessionId: this.sessionId,
      isMicOn: this.isMicOn,
    });
  }

  setGlobalSpeakerEnabled(enabled) {
    this.globalSpeakerEnabled = Boolean(enabled);
    this.applyRemoteAudioMuteStates();
  }

  setPlayerMuted(color, muted) {
    if (muted) this.mutedPlayerColors.add(color);
    else this.mutedPlayerColors.delete(color);
    const socketId = this.socketIds[color];
    if (socketId) this.applyRemoteAudioMuteState(socketId);
  }

  isRemoteAudioMutedForColor(color) {
    return !this.globalSpeakerEnabled || this.mutedPlayerColors.has(color);
  }

  applyRemoteAudioMuteStates() {
    Object.keys(this.remoteAudioEls).forEach((socketId) => {
      this.applyRemoteAudioMuteState(socketId);
    });
  }

  applyRemoteAudioMuteState(socketId) {
    const audio = this.remoteAudioEls[socketId];
    if (!audio) return;

    const color = this.socketIdColors[socketId];
    const muted =
      !this.globalSpeakerEnabled ||
      (color !== undefined && this.mutedPlayerColors.has(color));

    audio.muted = muted;
    audio.volume = muted ? 0 : 0.7;

    if (audio.srcObject) {
      audio.srcObject.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    if (muted) {
      audio.pause();
    } else {
      audio.play().catch((e) => {
        console.debug("Audio play deferred:", e);
      });
    }
  }

  addLocalTracksToPeers() {
    if (!this.localStream) return;
    Object.values(this.peers).forEach((pc) => {
      const localTrack = this.localStream.getAudioTracks()[0];
      if (!localTrack) return;
      const audioSender = pc
        .getSenders()
        .find((s) => s.track && s.track.kind === "audio");
      if (audioSender) {
        audioSender.replaceTrack(localTrack);
      } else {
        pc.addTrack(localTrack, this.localStream);
      }
    });
  }

  createPeerConnection(targetSocketId, isInitiator) {
    if (this.peers[targetSocketId]) {
      console.warn("Peer already exists, skipping:", targetSocketId);
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    });
    this.peers[targetSocketId] = pc;

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
        this.socket.emit("voice-signal", {
          roomId: this.roomId,
          toSocketId: targetSocketId,
          signal: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      let audio = this.remoteAudioEls[targetSocketId];
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.playsInline = true;
        audio.volume = 0.7;
        audio.muted = false;
        this.remoteAudioEls[targetSocketId] = audio;
      }
      const remoteStream = event.streams[0];
      if (!remoteStream) return;

      if (audio.srcObject) return;
      audio.srcObject = remoteStream;
      this.applyRemoteAudioMuteState(targetSocketId);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(
        `ICE Connection State [${targetSocketId}]: ${pc.iceConnectionState}`,
      );
    };

    pc.onconnectionstatechange = () => {
      console.log(
        `Connection State [${targetSocketId}]: ${pc.connectionState}`,
      );
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        this.cleanupPeerConnection(targetSocketId);
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          this.socket.emit("voice-signal", {
            roomId: this.roomId,
            toSocketId: targetSocketId,
            signal: pc.localDescription,
          });
        });
    }
  }

  setupDataChannel(sid, dc) {
    this.dataChannels[sid] = dc;
    dc.onopen = () => console.log(`DataChannel [${sid}] is OPEN`);
    dc.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "chat") {
        if (data.senderId && data.senderId === this.sessionId) return;
        this.game.chat.addMessage(data.sender, data.text, data.color);
        const senderPlayerId = Number.isInteger(data.playerId)
          ? data.playerId
          : data.sender;
        this.game.showAvatarMessage(senderPlayerId, data.text);
      }
    };
    dc.onclose = () => console.log(`DataChannel [${sid}] is CLOSED`);
  }

  cleanupPeerConnection(targetSocketId) {
    const pc = this.peers[targetSocketId];
    if (pc) {
      pc.close();
      delete this.peers[targetSocketId];
    }

    const audio = this.remoteAudioEls[targetSocketId];
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      delete this.remoteAudioEls[targetSocketId];
    }

    const dc = this.dataChannels[targetSocketId];
    if (dc) {
      dc.close();
      delete this.dataChannels[targetSocketId];
    }

    console.log(`Cleaned up connection for ${targetSocketId}`);
  }

  getSocketStatus() {
    return {
      ioAvailable: typeof io !== "undefined",
      socketExists: !!this.socket,
      connected: this.socket?.connected,
      id: this.socket?.id,
      url: this.socket?.io?.uri,
    };
  }
}
