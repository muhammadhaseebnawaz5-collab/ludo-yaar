export class NetworkManager {
  constructor(gameInstance) {
    this.game = gameInstance;

    // Track last real user gesture to prevent iOS Safari getUserMedia blocks
    this._lastUserGestureAt = 0;
    const markGesture = () => {
      this._lastUserGestureAt = Date.now();
    };
    window.addEventListener("touchstart", markGesture, { passive: true });
    window.addEventListener("pointerdown", markGesture, { passive: true });
    window.addEventListener("click", markGesture, { passive: true });

    // Full iOS Safari audio unlock handling
    this._audioCtx = null;
    this._audioUnlocked = false;

    window.addEventListener("ludo-audio-unlocked", () => {
      this.unlockAudioContextAndRetry("event:ludo-audio-unlocked");
    });

    // Also unlock on first visibility return (in case suspended)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.unlockAudioContextAndRetry("visibilitychange:visible");
        this.applyRemoteAudioMuteStates();
      }
    });

    // Use the global 'io' from the CDN script in index.html
    this.socket = null;
    if (typeof io !== "undefined") {
      // In production (Railway), let Socket.io auto-detect the host.
      // In dev, we might need an explicit URL if the frontend is on a different port.
      const isDev =
        typeof import.meta !== "undefined" &&
        typeof import.meta.env !== "undefined" &&
        import.meta.env.DEV;

      const socketUrl = isDev ? "http://localhost:3000" : undefined;
      console.log(
        "🔌 Connecting to socket server:",
        socketUrl || "Default (Same Origin)",
      );

      this.socket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 20000,
      });
    } else {
      console.error(
        "❌ Socket.io not found! The game will not be able to connect to the server.",
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
    if (!this.socket) return;

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

    // Handle peer disconnecting for voice cleanup
    this.socket.on("peer-disconnected", ({ socketId }) => {
      this.cleanupPeerConnection(socketId);
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
    // iOS Safari: getUserMedia must come from a real user gesture
    const now = Date.now();
    const gestureRecent = now - this._lastUserGestureAt < 1500;
    if (!gestureRecent) {
      console.warn("🎤 toggleMic blocked: no recent user gesture");
      return false;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("❌ mediaDevices.getUserMedia not available on this browser.");
      return false;
    }

    const secureOk =
      window.isSecureContext ||
      location.protocol === "https:" ||
      location.hostname === "localhost";
    if (!secureOk) {
      console.error("❌ Microphone requires HTTPS/secure context.");
      return false;
    }

    // Turning mic OFF
    if (this.localStream && this.isMicOn) {
      this.isMicOn = false;
      try {
        this.localStream.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        // Stop tracks to release mic on iOS
        this.localStream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      this.localStream = null;
      this.broadcastVoiceStatus();
      return false;
    }

    // Turning mic ON
    if (this.localStream) {
      // stream exists but mic off -> re-enable
      this.isMicOn = true;
      try {
        this.localStream.getAudioTracks().forEach((t) => (t.enabled = true));
      } catch {
        this.localStream = null;
      }
      this.broadcastVoiceStatus();
      this.addLocalTracksToPeers();
      return true;
    }

    // Re-request mic, with a small delay to help iOS permission flow settle
    try {
      console.log("🎤 Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      });

      // iOS may return immediately but tracks might be disabled briefly
      await new Promise((r) => setTimeout(r, 150));

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        console.error("❌ No audio tracks returned from getUserMedia.");
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      audioTracks.forEach((track) => {
        track.enabled = true;
      });

      this.localStream = stream;
      this.isMicOn = true;

      console.log("🎤 Mic ON - track enabled:", audioTracks[0]?.enabled);

      this.broadcastVoiceStatus();
      this.addLocalTracksToPeers();

      Object.values(this.socketIds).forEach((sid) => {
        if (sid !== this.socket?.id && !this.peers[sid]) {
          this.createPeerConnection(sid, true);
        }
      });

      return true;
    } catch (e) {
      // DeniedPermissionsError etc.
      console.warn("❌ Mic permission error:", e?.name || e, e);
      this.isMicOn = false;
      this.localStream = null;
      this.broadcastVoiceStatus();
      return false;
    }
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
    // Re-try play after toggling (mobile autoplay policies)
    this.unlockAudioContextAndRetry("speaker-toggle");
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
    if (!audio) {
      console.debug("⚠️ Audio element not found for", socketId);
      return;
    }

    const color = this.socketIdColors[socketId];
    const muted =
      !this.globalSpeakerEnabled ||
      (color !== undefined && this.mutedPlayerColors.has(color));

    audio.muted = muted;
    audio.volume = muted ? 0 : 0.8;

    // Important: Do NOT pause() on mute for Safari/WebRTC stability.
    // We only toggle muted + track.enabled.
    if (audio.srcObject) {
      try {
        audio.srcObject.getAudioTracks().forEach((track) => {
          track.enabled = !muted;
        });
      } catch (e) {
        console.warn("🔊 applyRemoteAudioMuteState track toggle failed:", e);
      }
    }

    if (!muted) {
      // Force play after srcObject assignment/unmute
      this.unlockAudioContextAndRetry(`audio-unmute:${socketId}`);
      audio
        .play()
        .then(() => {
          // ok
        })
        .catch((e) => {
          console.warn("🔊 Audio play blocked (retry later):", e?.name || e, socketId);
          setTimeout(() => {
            audio.play().catch(() => {});
          }, 600);
        });
    }
  }

  addLocalTracksToPeers() {
    if (!this.localStream) return;
    const localTrack = this.localStream.getAudioTracks()[0];
    if (!localTrack) {
      console.warn("❌ No local audio track found");
      return;
    }

    Object.entries(this.peers).forEach(([socketId, pc]) => {
      try {
        const audioSender = pc
          .getSenders()
          .find((s) => s.track && s.track.kind === "audio");
        if (audioSender) {
          console.log("🔄 Replacing audio track for", socketId);
          audioSender.replaceTrack(localTrack).catch((e) => {
            console.error("Replace track error:", e);
            pc.addTrack(localTrack, this.localStream);
          });
        } else {
          console.log("➕ Adding audio track to", socketId);
          pc.addTrack(localTrack, this.localStream);
        }
      } catch (e) {
        console.error("Error adding track to peer", socketId, e);
      }
    });
  }

  createPeerConnection(targetSocketId, isInitiator) {
    if (this.peers[targetSocketId]) {
      console.warn("Peer already exists, skipping:", targetSocketId);
      return;
    }

    // TURN is crucial for mobile networks/NAT that can't do STUN-only.
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
        // Public TURN fallback (may still be rate-limited). Replace with your own in prod.
        {
          urls: "turn:global-turn.metered.ca:80?transport=udp",
          username: "anonymous",
          credential: "anonymous",
        },
        {
          urls: "turn:global-turn.metered.ca:443?transport=tcp",
          username: "anonymous",
          credential: "anonymous",
        },
      ],
    });
    this.peers[targetSocketId] = pc;

    // 🔧 FIX: Add local audio tracks BEFORE creating offer (so they're included in SDP)
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        console.log("🎤 Adding local audio track to peer:", targetSocketId);
        pc.addTrack(audioTrack, this.localStream);
      }
    }

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
      console.log(`🎵 Received remote track from ${targetSocketId}`);
      const remoteStream = event.streams[0];
      if (!remoteStream) return;

      let audio = this.remoteAudioEls[targetSocketId];
      if (!audio) {
        audio = document.createElement("audio");
        audio.id = `audio-${targetSocketId}`;
        audio.autoplay = true;

        // iOS/Safari inline playback attributes
        audio.setAttribute("playsinline", "true");
        audio.setAttribute("webkit-playsinline", "true");
        audio.playsInline = true;

        // Avoid display:none which can break iOS playback. Use 1px hidden instead.
        audio.style.opacity = "0";
        audio.style.position = "absolute";
        audio.style.left = "-9999px";
        audio.style.top = "0";
        audio.style.width = "1px";
        audio.style.height = "1px";
        audio.style.pointerEvents = "none";

        document.body.appendChild(audio);
        console.log("📍 Audio element appended to DOM:", audio.id);

        this.remoteAudioEls[targetSocketId] = audio;
      }

      if (audio.srcObject !== remoteStream) {
        audio.srcObject = remoteStream;
        console.log("🎧 Audio stream set for", targetSocketId);

        // Ensure audio element play after srcObject assignment
        this.applyRemoteAudioMuteState(targetSocketId);
        this.unlockAudioContextAndRetry(`audio-src:${targetSocketId}`);

        audio
          .play()
          .then(() => {
            console.log("🔊 Remote audio play OK:", targetSocketId);
          })
          .catch((e) => {
            console.warn("🔊 Remote audio play failed:", e?.name || e, targetSocketId);
          });
      }
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
          console.log("📤 Offer sent to", targetSocketId);
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

  unlockAudioContextAndRetry(reason = "unknown") {
    try {
      // Lazily create/resume an AudioContext on user gesture
      if (!this._audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this._audioCtx = new Ctx();
        console.log("🔊 AudioContext created:", this._audioCtx.state, "reason:", reason);
      } else {
        console.log("🔊 AudioContext state:", this._audioCtx.state, "reason:", reason);
      }

      if (this._audioCtx && this._audioCtx.state === "suspended") {
        this._audioUnlocked = false;
        this._audioCtx.resume()
          .then(() => {
            this._audioUnlocked = true;
            console.log("🔊 AudioContext resumed:", this._audioCtx.state);
          })
          .catch((e) => console.warn("🔊 AudioContext resume failed:", e));
      } else {
        this._audioUnlocked = true;
      }
    } catch (e) {
      console.warn("🔊 unlockAudioContextAndRetry error:", e);
    }

    // Retry remote audio elements
    try {
      Object.keys(this.remoteAudioEls).forEach((sid) => {
        this.applyRemoteAudioMuteState(sid);
      });
    } catch {
      // ignore
    }
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
