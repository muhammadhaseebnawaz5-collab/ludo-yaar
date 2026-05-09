export class NetworkManager {
  constructor(gameInstance) {
    this.game = gameInstance;

    if (typeof io !== "undefined") {
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const socketUrl =
        isLocal && window.location.port !== "3000"
          ? "http://localhost:3000"
          : window.location.origin;

      console.log("🔌 Attempting to connect to socket server:", socketUrl);
      this.socket = io(socketUrl);
      this.setupSocketEvents(); // ✅ Sirf EK baar
    } else {
      console.error("❌ Socket.io not found!");
    }

    this.roomId = localStorage.getItem("ludoRoomId") || null;
    this.sessionId = localStorage.getItem("ludoSessionId") || null;
    this.userUUID = localStorage.getItem("ludoUserUUID") || this._genUUID();
    this.playerColor = null;

    this.peers = {};
    this.dataChannels = {};
    this.remoteAudioEls = {};
    this.socketIds = {};
    this.socketIdColors = {};
    this.localStream = null;
    this.isMicOn = false;
    this.globalSpeakerEnabled = true;
    this.mutedPlayerColors = new Set();

    this.onFriendInvite = null;
    this.onAutoRejoin = null;

    // ❌ REMOVED: this.setupSocketEvents(); — was causing duplicate events
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
    if (!this.localStream) {
      try {
        // ✅ Mobile-optimized constraints
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        const constraints = {
          audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            googEchoCancellation: true, // Chrome specific
            googAutoGainControl: true, // Chrome specific
            googNoiseSuppression: true, // Chrome specific
            googHighpassFilter: true, // Chrome specific
            // ✅ Mobile pe lower sample rate (reduces feedback)
            sampleRate: isMobile ? 16000 : 48000,
            channelCount: 1, // Mono (less feedback on mobile)
          },
        };

        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

        this.localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
          console.log("🎤 Mic track settings:", track.getSettings());
        });

        // ✅ NEVER create Audio element for local stream
        // (even muted=true autoplay can cause echo on some browsers)

        this.isMicOn = true;
        this.broadcastVoiceStatus();
        this.addLocalTracksToPeers();

        Object.values(this.socketIds).forEach((sid) => {
          if (sid !== this.socket.id && !this.peers[sid]) {
            this.createPeerConnection(sid, true);
          }
        });
      } catch (e) {
        console.error("❌ Mic access denied:", e);
        return false;
      }
    } else {
      this.isMicOn = !this.isMicOn;
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = this.isMicOn;
      });
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
    if (!audio) return;

    const color = this.socketIdColors[socketId];
    const shouldMute =
      !this.globalSpeakerEnabled ||
      (color !== undefined && this.mutedPlayerColors.has(color));

    if (shouldMute) {
      // ✅ Smooth mute — no abrupt cut (prevents beep)
      const fadeOut = setInterval(() => {
        if (audio.volume > 0.05) {
          audio.volume = Math.max(0, audio.volume - 0.15);
        } else {
          audio.volume = 0;
          audio.muted = true;
          audio.pause();
          if (audio.srcObject) {
            audio.srcObject.getAudioTracks().forEach((t) => (t.enabled = false));
          }
          clearInterval(fadeOut);
        }
      }, 20);
    } else {
      // ✅ Smooth unmute — gradual volume increase (prevents pop/beep)
      audio.muted = false;
      audio.volume = 0;
      if (audio.srcObject) {
        audio.srcObject.getAudioTracks().forEach((t) => (t.enabled = true));
      }

      audio
        .play()
        .then(() => {
          const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          const targetVol = isMobile ? 0.7 : 0.85;

          const fadeIn = setInterval(() => {
            if (audio.volume < targetVol - 0.05) {
              audio.volume = Math.min(targetVol, audio.volume + 0.1);
            } else {
              audio.volume = targetVol;
              clearInterval(fadeIn);
            }
          }, 30);
        })
        .catch((e) => {
          console.debug("Audio play blocked:", e);
          // ✅ Mobile pe user gesture ke baad play karo
          const playOnTouch = () => {
            audio.play().catch(() => {});
            document.removeEventListener("touchstart", playOnTouch);
            document.removeEventListener("click", playOnTouch);
          };
          document.addEventListener("touchstart", playOnTouch, { once: true });
          document.addEventListener("click", playOnTouch, { once: true });
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
    // ✅ Hard protection against duplicates
    if (this.peers[targetSocketId]) {
      console.warn("Peer already exists, skipping:", targetSocketId);
      return;
    }

    // ✅ Don't connect to yourself
    if (targetSocketId === this.socket.id) {
      console.warn("Skipping self-connection");
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
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
        this.socket.emit("voice-signal", {
          roomId: this.roomId,
          toSocketId: targetSocketId,
          signal: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (targetSocketId === this.socket.id) return;

      const remoteStream = event.streams[0];
      if (!remoteStream) return;

      let audio = this.remoteAudioEls[targetSocketId];

      if (!audio) {
        audio = new Audio();

        // ✅ Mobile-specific audio settings
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        audio.autoplay = true;
        audio.playsInline = true;
        audio.setAttribute("playsinline", "");
        audio.setAttribute("webkit-playsinline", "");

        // ✅ Mobile pe earpiece instead of speaker (prevents echo)
        if (isMobile && audio.setSinkId) {
          // Try to use earpiece on mobile
          audio.setSinkId("").catch(() => {});
        }

        audio.volume = isMobile ? 0.7 : 0.85;
        audio.muted = false;

        this.remoteAudioEls[targetSocketId] = audio;
      }

      if (audio.srcObject !== remoteStream) {
        audio.pause();
        audio.srcObject = null;
        audio.srcObject = remoteStream;
      }

      this.applyRemoteAudioMuteState(targetSocketId);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE [${targetSocketId}]: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "failed") {
        console.warn("ICE failed, restarting...");
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection [${targetSocketId}]: ${pc.connectionState}`);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        this.cleanupPeerConnection(targetSocketId);
      }
    };

    // ✅ Add local tracks if mic is already on
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        const alreadyAdded = pc
          .getSenders()
          .find((s) => s.track === track);
        if (!alreadyAdded) {
          pc.addTrack(track, this.localStream);
        }
      });
    }

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          this.socket.emit("voice-signal", {
            roomId: this.roomId,
            toSocketId: targetSocketId,
            signal: pc.localDescription,
          });
        })
        .catch((e) => console.error("Offer creation failed:", e));
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
