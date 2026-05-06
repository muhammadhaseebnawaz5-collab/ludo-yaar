import {
  SCREEN_W,
  SCREEN_H,
  PLAYER_NAMES,
  PLAYER_COLORS,
  BOARD_X,
  BOARD_SIZE,
  BOARD_Y,
  PLAYER_ROTATIONS,
} from "./constants.js";
import { LudoGame } from "./game.js";
import { NetworkManager } from "./network.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const appEl = document.getElementById("app");
const gameContainer = document.querySelector(".game-container");
const mobileChatInput = document.createElement("input");
mobileChatInput.type = "text";
mobileChatInput.className = "mobile-chat-input-proxy";
mobileChatInput.setAttribute("autocomplete", "off");
mobileChatInput.setAttribute("autocapitalize", "sentences");
mobileChatInput.setAttribute("autocorrect", "on");
mobileChatInput.setAttribute("spellcheck", "true");
gameContainer.appendChild(mobileChatInput);

let game = new LudoGame();
let network = new NetworkManager(game);
game.network = network;

// Set up auto-rejoin callback
network.onAutoRejoin = function (res) {
  const name = localStorage.getItem("ludoLastName") || "Player";
  isHost = false;
  enterWaitingRoom(res.roomId, name, false);
  if (res.state && res.state.gameState !== "lobby") {
    // Reconnected to an active game
    game.startGameFromServer(res.state);
  }
};

// ═══════════════════════════════════════════
//  ELEMENTS
// ═══════════════════════════════════════════
const lobbyScreen = document.getElementById("lobbyScreen");
const waitingRoom = document.getElementById("waitingRoom");
const joinPopup = document.getElementById("joinPopup");
const friendsPopup = document.getElementById("friendsPopup");
const inviteBanner = document.getElementById("inviteBanner");

const playerNameInput = document.getElementById("playerNameInput");
const btnStart = document.getElementById("btnStart");
const btnOpenJoin = document.getElementById("btnOpenJoin");
const playerCountRow = document.getElementById("playerCountRow");

const btnCloseJoin = document.getElementById("btnCloseJoin");
const joinCodeInput = document.getElementById("joinCodeInput");
const btnConfirmJoin = document.getElementById("btnConfirmJoin");
const joinError = document.getElementById("joinError");

const displayTableCode = document.getElementById("displayTableCode");
const btnCopyCode = document.getElementById("btnCopyCode");
const copyConfirm = document.getElementById("copyConfirm");
const slotsContainer = document.getElementById("slots");
const btnInviteFriends = document.getElementById("btnInviteFriends");
const btnShare = document.getElementById("btnShare");
const btnStartGame = document.getElementById("btnStartGame");
const waitP = document.getElementById("waitP");

const btnCloseFriends = document.getElementById("btnCloseFriends");
const friendsList = document.getElementById("friendsList");
const noFriendsMsg = document.getElementById("noFriendsMsg");
const friendSearchInput = document.getElementById("friendSearchInput");

const btnAcceptInvite = document.getElementById("btnAcceptInvite");
const btnDeclineInvite = document.getElementById("btnDeclineInvite");
const ibSenderName = document.getElementById("ibSenderName");
const btnBack = document.getElementById("btnBack");
const backConfirm = document.getElementById("backConfirm");
const btnBackYes = document.getElementById("btnBackYes");
const btnBackNo = document.getElementById("btnBackNo");

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let selectedCount = 2;
let isHost = false;
let pendingInvite = null; // { roomId, senderName }
let teamUpMode = false;

// ═══════════════════════════════════════════
//  PLAYER COUNT SELECTION
// ═══════════════════════════════════════════
playerCountRow.querySelectorAll(".count-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    playerCountRow
      .querySelectorAll(".count-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedCount = parseInt(btn.dataset.count);

    // Update Team Up visibility based on player count (only for 4 players)
    const teamUpBtn = document.getElementById("btnTeamUp");
    if (selectedCount === 4) {
      teamUpBtn.classList.remove("hidden");
    } else {
      teamUpBtn.classList.add("hidden");
      teamUpMode = false;
      updateTeamUpBtnUI();
    }
  });
});

// Team Up Toggle
const btnTeamUp = document.getElementById("btnTeamUp");
btnTeamUp.addEventListener("click", () => {
  teamUpMode = !teamUpMode;
  updateTeamUpBtnUI();
});

function updateTeamUpBtnUI() {
  btnTeamUp.textContent = teamUpMode ? "✅ TEAM UP ON" : "👥 TEAM UP";
  btnTeamUp.style.background = teamUpMode ? "#28A33E" : "#3A1060";
}

// ═══════════════════════════════════════════
//  SCREEN HELPERS
// ═══════════════════════════════════════════
function showScreen(el) {
  [lobbyScreen, waitingRoom].forEach((s) => {
    s.classList.remove("active");
    s.classList.add("hidden");
  });
  el.classList.remove("hidden");
  el.classList.add("active");
}

function showPopup(el) {
  el.classList.remove("hidden");
}
function hidePopup(el) {
  el.classList.add("hidden");
}

function isVisible(el) {
  return el && !el.classList.contains("hidden");
}

function showBackConfirm() {
  backConfirm.classList.remove("hidden");
}

function hideBackConfirm() {
  backConfirm.classList.add("hidden");
}

function returnToMainMenu() {
  hidePopup(joinPopup);
  hidePopup(friendsPopup);
  inviteBanner.classList.add("hidden");
  pendingInvite = null;

  game.chat.visible = false;
  game.chat.active = false;
  game.emojiPanel.visible = false;
  game.gameState = "setup";
  game.winner = null;
  game.rollQueue = [];
  game.moveSelection.hide();
  game.junctionArrows.hide();
  game.activePlayerColors = [];

  network.leaveRoom();
  isHost = false;
  showScreen(lobbyScreen);
}

function confirmBackNavigation() {
  hideBackConfirm();

  if (isVisible(friendsPopup)) {
    hidePopup(friendsPopup);
    return;
  }
  if (isVisible(joinPopup)) {
    hidePopup(joinPopup);
    return;
  }
  if (isVisible(inviteBanner)) {
    inviteBanner.classList.add("hidden");
    pendingInvite = null;
    return;
  }
  if (isVisible(waitingRoom) || !isVisible(lobbyScreen)) {
    returnToMainMenu();
    return;
  }

  if (game.gameState !== "setup" && game.gameState !== "lobby") {
    returnToMainMenu();
  }
}

btnBack.addEventListener("click", showBackConfirm);
btnBackNo.addEventListener("click", hideBackConfirm);
btnBackYes.addEventListener("click", confirmBackNavigation);

// ═══════════════════════════════════════════
//  LOBBY — START
// ═══════════════════════════════════════════
btnStart.addEventListener("click", () => {
  const name = playerNameInput.value.trim() || "Host";
  localStorage.setItem("ludoLastName", name); // Persist for refresh
  btnStart.disabled = true;
  btnStart.textContent = "⏳ Creating…";

  network.createRoom(name, selectedCount, teamUpMode, (res) => {
    btnStart.disabled = false;
    btnStart.textContent = "▶ PLAY WITH FRIENDS";
    if (res.success) {
      window.debugLog(`Room created: ${res.roomId}`);
      isHost = true;
      enterWaitingRoom(res.roomId, name, true);
    } else {
      window.debugLog(`Room creation failed: ${res.error}`, "error");
    }
  });
});

// ═══════════════════════════════════════════
//  LOBBY — VS COMPUTER
// ═══════════════════════════════════════════
const btnVsComputer = document.getElementById("btnVsComputer");
btnVsComputer.addEventListener("click", () => {
  const name = playerNameInput.value.trim() || "Player";
  localStorage.setItem("ludoLastName", name);
  btnVsComputer.disabled = true;
  btnVsComputer.textContent = "⏳ Loading…";

  // Create a 2-player room and start it after the server has registered the room
  network.createRoom(name, 2, false, (res) => {
    btnVsComputer.disabled = false;
    btnVsComputer.textContent = "🤖 VS COMPUTER";
    if (!res.success) {
      window.debugLog(
        `VS COMPUTER room creation failed: ${res.error}`,
        "error",
      );
      return;
    }

    window.debugLog(`VS COMPUTER room created: ${res.roomId}`);
    isHost = true;

    // Give socket.io a moment so room/start-game ordering is consistent
    setTimeout(() => {
      network.startGame();
      window.debugLog("StartGame command sent for VS COMPUTER");
    }, 500);
  });
});

// ═══════════════════════════════════════════
//  LOBBY — JOIN (open popup)
// ═══════════════════════════════════════════
btnOpenJoin.addEventListener("click", () => {
  joinError.classList.add("hidden");
  joinCodeInput.value = "";
  showPopup(joinPopup);
  setTimeout(() => joinCodeInput.focus(), 100);
});
btnCloseJoin.addEventListener("click", () => hidePopup(joinPopup));

btnConfirmJoin.addEventListener("click", attemptJoin);
joinCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptJoin();
});

function attemptJoin() {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) return;
  const name = playerNameInput.value.trim() || "Player";
  localStorage.setItem("ludoLastName", name);
  joinError.classList.add("hidden");
  btnConfirmJoin.disabled = true;
  btnConfirmJoin.textContent = "Joining…";

  network.joinRoom(code, name, (res) => {
    btnConfirmJoin.disabled = false;
    btnConfirmJoin.textContent = "Join Table";
    if (res.success) {
      hidePopup(joinPopup);
      isHost = false;
      enterWaitingRoom(code, name, false);
      if (res.state && res.state.gameState !== "lobby") {
        // Reconnected to an active game → skip waiting room
        game.startGameFromServer(res.state);
      }
    } else {
      joinError.textContent =
        res.error || "Code not found. Check and try again.";
      joinError.classList.remove("hidden");
    }
  });
}

// ═══════════════════════════════════════════
//  WAITING ROOM
// ═══════════════════════════════════════════

/** Represents the current players in the waiting room slots */
let waitSlots = []; // array of { name, colorIndex, isYou }

function enterWaitingRoom(roomCode, myName, host) {
  isHost = host;
  displayTableCode.textContent = roomCode;
  showScreen(waitingRoom);

  if (host) {
    btnStartGame.classList.remove("hidden");
    waitP.classList.add("hidden");
  } else {
    btnStartGame.classList.add("hidden");
    waitP.classList.remove("hidden");
  }

  // Register this user globally with server for direct invites
  network.registerUser(myName);

  // Store in friends → they'll see us as online
  updateWaitSlots([{ name: myName, color: network.playerColor, isYou: true }]);
}

/** Called by network when room-update fires */
game.updateLobbyPlayers = function (players) {
  game.activePlayerColors = players
    .map((p) => p.color)
    .filter((color) => Number.isInteger(color))
    .sort((a, b) => a - b);

  // 1. ALWAYS update avatar bot state and name (critical for in-game sync)
  players.forEach((p) => {
    PLAYER_NAMES[p.color] = p.name;
    if (game.avatars[p.color]) {
      game.avatars[p.color].name = p.name;
      game.avatars[p.color].botEnabled = !!p.botEnabled;
    }
  });

  // 2. Update Lobby UI ONLY if the element exists (prevents crash during game)
  if (slotsContainer) {
    const myColor = network.playerColor;
    const totalNeeded = selectedCount;

    const slots = players.map((p) => ({
      name: p.name,
      colorIndex: p.color,
      isYou: p.color === myColor,
      filled: true,
    }));

    // Pad with empty slots
    for (let i = slots.length; i < totalNeeded; i++) {
      slots.push({ empty: true });
    }

    updateWaitSlots(slots);
  }

  // Auto-save any new friends
  players.forEach((p) => {
    if (p.color !== network.playerColor) {
      addFriend(p.name, p.color, network.theirSessionId || null);
    }
  });

  // Auto-start when full (only if still in lobby)
  if (
    isHost &&
    players.length === selectedCount &&
    game.gameState === "lobby"
  ) {
    setTimeout(() => network.startGame(), 800);
  }
};

function updateWaitSlots(slots) {
  slotsContainer.innerHTML = "";
  slots.forEach((slot) => {
    const div = document.createElement("div");
    div.className = "player-slot";

    const avatar = document.createElement("div");
    const label = document.createElement("div");
    label.className = "slot-label";

    if (slot.empty) {
      avatar.className = "slot-avatar empty";
      avatar.textContent = "+";
      label.textContent = "Waiting…";
    } else if (slot.inviting) {
      avatar.className = `slot-avatar inviting color-${slot.colorIndex ?? 0}`;
      avatar.textContent = "⏳";
      label.textContent = "Inviting…";
    } else {
      avatar.className = `slot-avatar filled color-${slot.colorIndex ?? 0}`;
      avatar.textContent = (slot.name || "?")[0].toUpperCase();
      label.className = `slot-label${slot.isYou ? " you" : ""}`;
      label.textContent = slot.isYou ? "You" : slot.name;
    }

    div.appendChild(avatar);
    div.appendChild(label);
    slotsContainer.appendChild(div);
  });
}

// Copy code
btnCopyCode.addEventListener("click", () => {
  const code = displayTableCode.textContent;
  navigator.clipboard.writeText(code).then(() => {
    copyConfirm.classList.remove("hidden");
    setTimeout(() => copyConfirm.classList.add("hidden"), 1800);
  });
});

// Share
btnShare.addEventListener("click", () => {
  const code = displayTableCode.textContent;
  const url = `${location.origin}?join=${code}`;
  if (navigator.share) {
    navigator.share({
      title: "Join my Ludo table!",
      text: `Use code: ${code}`,
      url,
    });
  } else {
    navigator.clipboard.writeText(`Join my Ludo table! Code: ${code}\n${url}`);
    copyConfirm.textContent = "Link copied!";
    copyConfirm.classList.remove("hidden");
    setTimeout(() => {
      copyConfirm.classList.add("hidden");
      copyConfirm.textContent = "Copied!";
    }, 1800);
  }
});

// Host: manual start
btnStartGame.addEventListener("click", () => {
  network.startGame();
});

// ═══════════════════════════════════════════
//  FRIENDS SYSTEM
// ═══════════════════════════════════════════

/** Friends stored in localStorage as array of { uuid, name, colorIndex, lastSeen } */
function getFriends() {
  try {
    return JSON.parse(localStorage.getItem("ludoFriends") || "[]");
  } catch {
    return [];
  }
}
function saveFriends(list) {
  localStorage.setItem("ludoFriends", JSON.stringify(list));
}
function addFriend(name, colorIndex, uuid) {
  const list = getFriends();
  const existing = list.find((f) => f.name === name);
  if (existing) {
    existing.lastSeen = Date.now();
    if (uuid) existing.uuid = uuid;
  } else {
    list.push({
      uuid: uuid || `local-${Date.now()}`,
      name,
      colorIndex: colorIndex ?? 0,
      lastSeen: Date.now(),
    });
  }
  saveFriends(list);
}

// Open friends popup
btnInviteFriends.addEventListener("click", () => {
  renderFriendsList();
  showPopup(friendsPopup);
});
btnCloseFriends.addEventListener("click", () => hidePopup(friendsPopup));

friendSearchInput.addEventListener("input", renderFriendsList);

function renderFriendsList(onlineSessions) {
  const q = (friendSearchInput.value || "").trim().toLowerCase();
  let friends = getFriends().filter(
    (f) => !q || f.name.toLowerCase().includes(q),
  );

  // Merge online status from server response if available
  const onlineMap = window._onlineFriends || {};

  // Sort: online first
  friends.sort((a, b) => {
    const ao = !!onlineMap[a.uuid];
    const bo = !!onlineMap[b.uuid];
    return ao === bo ? b.lastSeen - a.lastSeen : bo ? 1 : -1;
  });

  friendsList.innerHTML = "";

  if (friends.length === 0) {
    noFriendsMsg.classList.remove("hidden");
  } else {
    noFriendsMsg.classList.add("hidden");
    friends.forEach((f) => {
      const isOnline = !!onlineMap[f.uuid];
      const lastSeenText = isOnline ? "Online" : friendLastSeen(f.lastSeen);

      const li = document.createElement("li");
      li.className = "friend-item";
      li.innerHTML = `
                <div class="fi-avatar color-${f.colorIndex}">${f.name[0].toUpperCase()}</div>
                <div class="fi-info">
                    <div class="fi-name">${f.name}</div>
                    <div class="fi-status ${isOnline ? "online" : "offline"}">${lastSeenText}</div>
                </div>
                <button class="fi-invite-btn" ${!isOnline ? "disabled" : ""} data-uuid="${f.uuid}">
                    ${isOnline ? "Invite" : "Offline"}
                </button>`;
      li.querySelector(".fi-invite-btn").addEventListener("click", () => {
        inviteFriend(f);
        li.querySelector(".fi-invite-btn").textContent = "Sent ✓";
        li.querySelector(".fi-invite-btn").disabled = true;
      });
      friendsList.appendChild(li);
    });
  }

  // Ask server for realtime online statuses
  const uuids = getFriends()
    .map((f) => f.uuid)
    .filter(Boolean);
  if (uuids.length) {
    network.checkFriendsStatus(uuids, (statuses) => {
      window._onlineFriends = statuses; // { uuid: true/false }
      renderFriendsList(); // re-render with fresh status
    });
  }
}

function friendLastSeen(ts) {
  if (!ts) return "Offline";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function inviteFriend(friend) {
  const roomId = network.roomId;
  if (!roomId) return;
  network.inviteFriend(friend.uuid, friend.name, roomId);

  // Mark their slot as "inviting"
  // We try to find the empty slot and mark it
  updateSlotAsInviting(friend.colorIndex);
}

function updateSlotAsInviting(colorIndex) {
  // Find first empty slot and set as inviting
  const empties = slotsContainer.querySelectorAll(".slot-avatar.empty");
  if (empties.length === 0) return;
  const avatar = empties[0];
  const label = avatar.parentElement.querySelector(".slot-label");
  avatar.className = `slot-avatar inviting color-${colorIndex}`;
  avatar.textContent = "⏳";
  if (label) {
    label.textContent = "Inviting…";
  }
}

// ═══════════════════════════════════════════
//  INCOMING INVITE
// ═══════════════════════════════════════════

/** Called by network when a 'friend-invite' event is received */
network.onFriendInvite = function ({ senderName, senderColor, roomId }) {
  pendingInvite = { roomId, senderName };
  ibSenderName.textContent = senderName;
  document.getElementById("ibAvatar").textContent = senderName[0].toUpperCase();
  document.getElementById("ibAvatar").className =
    `ib-avatar color-${senderColor ?? 0}`;
  inviteBanner.classList.remove("hidden");

  // Auto-dismiss after 15 seconds
  clearTimeout(inviteBanner._dismissTimer);
  inviteBanner._dismissTimer = setTimeout(
    () => inviteBanner.classList.add("hidden"),
    15000,
  );
};

btnAcceptInvite.addEventListener("click", () => {
  if (!pendingInvite) return;
  inviteBanner.classList.add("hidden");
  const name = playerNameInput.value.trim() || "Player";
  localStorage.setItem("ludoLastName", name);
  network.joinRoom(pendingInvite.roomId, name, (res) => {
    if (res.success) {
      isHost = false;
      enterWaitingRoom(pendingInvite.roomId, name, false);
      if (res.state && res.state.gameState !== "lobby") {
        game.startGameFromServer(res.state);
      }
    } else {
      alert(res.error || "Could not join table");
    }
  });
  pendingInvite = null;
});

btnDeclineInvite.addEventListener("click", () => {
  inviteBanner.classList.add("hidden");
  pendingInvite = null;
});

// ═══════════════════════════════════════════
//  GAME START
// ═══════════════════════════════════════════

/** Called when the server fires game-started */
game.startGameFromServer = function (state) {
  hidePopup(friendsPopup);
  lobbyScreen.classList.add("hidden");
  lobbyScreen.classList.remove("active");
  waitingRoom.classList.add("hidden");
  waitingRoom.classList.remove("active");
  game.clientPlayer = network.playerColor;
  game.syncState(state);
  game.gameState = state.gameState;
};

// Redundant startGame was removed. Direct calls to game.startGameFromServer are used instead.

// Auto-join from URL param (e.g. shared link)
(function checkUrlJoin() {
  const params = new URLSearchParams(location.search);
  const code = params.get("join");
  if (code) {
    joinCodeInput.value = code;
    showPopup(joinPopup);
  }

  // Load last used name
  const lastName = localStorage.getItem("ludoLastName");
  if (lastName) {
    playerNameInput.value = lastName;
  }
})();

function resize() {
  const rect = appEl.getBoundingClientRect();
  const scale = Math.min(rect.width / SCREEN_W, rect.height / SCREEN_H);

  // Keep canvas logical coordinate system stable for pointer mapping
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;

  // Scale the DOM element (NOT via transform: scale) to preserve pointer mapping
  canvas.style.width = `${SCREEN_W * scale}px`;
  canvas.style.height = `${SCREEN_H * scale}px`;
}
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
window.visualViewport?.addEventListener("scroll", resize);
resize();

// ═══════════════════════════════════════════
//  INPUT HANDLING
// ═══════════════════════════════════════════
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches?.[0] || e.changedTouches?.[0] || e;

  return [
    (touch.clientX - rect.left) * (SCREEN_W / rect.width),
    (touch.clientY - rect.top) * (SCREEN_H / rect.height),
  ];
}

function syncMobileChatInput() {
  mobileChatInput.value = game.chat.inputText || "";
}

function focusMobileChatInput() {
  syncMobileChatInput();
  mobileChatInput.focus();
  mobileChatInput.setSelectionRange(
    mobileChatInput.value.length,
    mobileChatInput.value.length,
  );
}

function sendMyChatMessage(text) {
  const message = String(text || "").trim();
  if (!message) return;

  const pColor = network.playerColor ?? 0;
  const pName = PLAYER_NAMES[pColor] || "Me";
  game.chat.addMessage(pName, message, PLAYER_COLORS[pColor]);
  game.showAvatarMessage(pColor, message);
  network.sendChat(message, pName, PLAYER_COLORS[pColor]);
}

function handleInput(e) {
  if (e.cancelable && e.target === canvas) e.preventDefault();
  const pos = getPos(e);
  if (!pos) return;
  const [sx, sy] = pos;

  // Heartbeat to reset server-side auto-turn timer
  if (network) network.sendActivity();

  // CALCULATE LOGICAL COORDINATES (UN-ROTATED) FOR BOARD CLICKS
  const bcx = BOARD_X + BOARD_SIZE / 2;
  const bcy = BOARD_Y + BOARD_SIZE / 2;
  const angle = PLAYER_ROTATIONS[game.clientPlayer] || 0;
  const dx = sx - bcx;
  const dy = sy - bcy;
  const lx = bcx + dx * Math.cos(-angle) - dy * Math.sin(-angle);
  const ly = bcy + dx * Math.sin(-angle) + dy * Math.cos(-angle);

  // 1. JUNCTION CHOICE (Priority #1)
  if (game.gameState === "junction") {
    const junctionChoice = game.junctionArrows.handleClick(sx, sy);
    if (junctionChoice !== null) {
      if (game.network && game.network.selectJunction) {
        game.network.selectJunction(junctionChoice);
      }
      game.resolveJunction(junctionChoice);
      return; // STOP: Choice made
    }
  }

  if (game.moveSelection.activeToken) {
    const moveOption = game.moveSelection.handleClick(lx, ly, sx, sy);
    if (moveOption !== null) {
      const token = game.moveSelection.activeToken;
      game.moveSelection.hide();
      network.moveToken(token.index, moveOption);
      return; // STOP: Move selected
    }
  }

  // Emoji button (icon at position 12-36)
  if (sx >= 6 && sx <= 42 && sy >= SCREEN_H - 52 && sy <= SCREEN_H - 16) {
    // Increase touch target for mobile (>=44px)
    if (sx >= 0 && sx <= 48 && sy >= SCREEN_H - 60 && sy <= SCREEN_H - 8) {
      game.emojiPanel.visible = !game.emojiPanel.visible;
      game.chat.visible = false;
      return;
    }
  }
  // Chat button (increase touch target)
  if (sx >= 48 && sx <= 100 && sy >= SCREEN_H - 60 && sy <= SCREEN_H - 8) {
    game.chat.visible = !game.chat.visible;
    game.chat.active = game.chat.visible;
    game.emojiPanel.visible = false;
    return;
  }

  // Chat interactions + click-outside close
  if (game.chat.visible) {
    const closeRect = game.chat.getCloseButtonRect();
    const closeClicked =
      sx >= closeRect.x &&
      sx <= closeRect.x + closeRect.w &&
      sy >= closeRect.y &&
      sy <= closeRect.y + closeRect.h;
    if (closeClicked) {
      game.chat.visible = false;
      game.chat.active = false;
      mobileChatInput.blur();
      return;
    }

    const quickAction = game.chat.getQuickActionAt(sx, sy);
    if (quickAction) {
      sendMyChatMessage(quickAction);
      game.chat.visible = false;
      game.chat.active = false;
      mobileChatInput.blur();
      return;
    }

    const inputRect = game.chat.getInputRect();
    const inputClicked =
      sx >= inputRect.x &&
      sx <= inputRect.x + inputRect.w &&
      sy >= inputRect.y &&
      sy <= inputRect.y + inputRect.h;
    if (inputClicked) {
      game.chat.active = true;
      focusMobileChatInput();
      return;
    }

    const sendRect = game.chat.getSendButtonRect();
    const sendClicked =
      sx >= sendRect.x &&
      sx <= sendRect.x + sendRect.w &&
      sy >= sendRect.y &&
      sy <= sendRect.y + sendRect.h;
    if (sendClicked) {
      if (game.chat.inputText.trim()) {
        sendMyChatMessage(game.chat.inputText);
        game.chat.inputText = "";
        syncMobileChatInput();
        game.chat.visible = false;
        game.chat.active = false;
      }
      return;
    }

    if (!game.chat.containsPoint(sx, sy)) {
      game.chat.visible = false;
      game.chat.active = false;
      mobileChatInput.blur();
    }
  }

  // Crown / Roll
  {
    const p = game.currentPlayer;
    const v = game.getVisualIndex(p);
    const isTop = v <= 1;
    const isRight = v === 1 || v === 2;
    const clX = isRight ? SCREEN_W - 238 : 92;
    const clY = isTop ? 18 : SCREEN_H - 152;
    const crX = clX + 62,
      crY = clY + 23;
    if (Math.hypot(sx - crX, sy - crY) <= 36) {
      if (game.currentPlayer === network.playerColor) {
        network.rollDice();
      }
      return;
    }
  }

  // Individual speaker mute beside each opponent avatar
  for (const p of game.getActivePlayerColors()) {
    if (p === network.playerColor || !game.avatars[p]) continue;
    const muteBtn = game.getPlayerMuteButtonRect(p);
    if (Math.hypot(sx - muteBtn.x, sy - muteBtn.y) <= muteBtn.r + 16) {
      game.toggleRemotePlayerMute(p);
      return;
    }
  }

  // AUTO badge click check (har player ke liye)
  for (const p of game.getActivePlayerColors()) {
    const av = game.avatars[p];
    if (!av) continue;
    const [avX, avY] = av.position;
    const isTop = game.getVisualIndex(p) <= 1;
    const avR = 30;
    const badgeY = isTop ? avY - avR - 28 : avY + avR + 12; // Updated to match new badge position

    // enlarge auto/bot badge hitbox for touch
    if (
      sx >= avX - 44 &&
      sx <= avX + 44 &&
      sy >= badgeY - 6 &&
      sy <= badgeY + 34
    ) {
      // Sirf apna badge click ho sakta hai
      if (p === network.playerColor) {
        const newState = !av.botEnabled;
        network.toggleBot(newState);
        av.botEnabled = newState; // Instant feedback

        // Agar bot off kar raha hai → khud khel raha hai
        if (!newState) {
          game.gameState = "roll"; // wapis control lo
        }
      }
      return;
    }
  }

  if (sx >= 106 && sx <= 142 && sy >= SCREEN_H - 52 && sy <= SCREEN_H - 16) {
    network.toggleMic().then((isOn) => {
      game.localMicMuted = !isOn;
    });
    return;
  }
  if (sx >= 156 && sx <= 192 && sy >= SCREEN_H - 52 && sy <= SCREEN_H - 16) {
    game.setGlobalSpeakerEnabled(!game.speakerPanelVisible);
    return;
  }

  // Use logical coordinates (lx, ly) for board-related clicks
  game.handleTokenClick(lx, ly);

  if (game.emojiPanel.visible) {
    const eyBase = 520,
      exBase = 20;
    const { cols, pad, size, rows } = game.emojiPanel.getEmojiGridBounds(
      exBase,
      eyBase,
    );
    for (let i = 0; i < game.emojiPanel.emojis.length; i++) {
      const ex = exBase + pad + (i % cols) * (size + pad) + size / 2;
      const ey = eyBase + pad + Math.floor(i / cols) * (size + pad) + size / 2;
      // enlarge emoji hitbox for touch
      if (
        Math.abs(sx - ex) < size / 2 + 10 &&
        Math.abs(sy - ey) < size / 2 + 10
      ) {
        const emoji = game.emojiPanel.emojis[i];
        const myAvatar = game.avatars[network.playerColor];
        if (myAvatar) {
          myAvatar.setEmoji(emoji, 120);
        }
        game.emojiPanel.visible = false;
        sendMyChatMessage(emoji);
        return;
      }
    }
  }
}

function isEventInsideChatUI(e) {
  const t = e?.target;
  if (!t) return false;
  // The real input element is our proxy
  if (t === mobileChatInput) return true;
  // If the click is on any known chat control inside canvas-drawn UI, it won't have DOM nodes,
  // so we only need to guard against the actual DOM input.
  return false;
}

canvas.addEventListener(
  "pointerdown",
  (e) => {
    // If chat input is active, don't let the canvas handler swallow the tap that should focus the input.
    if (game?.chat?.active && isEventInsideChatUI(e)) return;
    handleInput(e);
  },
  { passive: false },
);

mobileChatInput.addEventListener("input", () => {
  game.chat.inputText = mobileChatInput.value;
});

mobileChatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (game.chat.inputText.trim()) {
      sendMyChatMessage(game.chat.inputText);
      game.chat.inputText = "";
      syncMobileChatInput();
      game.chat.visible = false;
      game.chat.active = false;
      mobileChatInput.blur();
    }
  }
});

mobileChatInput.addEventListener("blur", () => {
  if (!game.chat.visible) {
    game.chat.active = false;
  }
});

window.addEventListener("keydown", (e) => {
  if (game.chat.active) {
    if (e.key === "Enter") {
      if (game.chat.inputText) {
        sendMyChatMessage(game.chat.inputText);
        game.chat.inputText = "";
        syncMobileChatInput();
        game.chat.visible = false;
        game.chat.active = false;
        mobileChatInput.blur();
      }
    } else if (e.key === "Backspace") {
      game.chat.inputText = game.chat.inputText.slice(0, -1);
      syncMobileChatInput();
    } else if (e.key.length === 1) {
      game.chat.inputText += e.key;
      syncMobileChatInput();
    }
  } else if (e.key === " " && game.currentPlayer === network.playerColor) {
    e.preventDefault();
    network.rollDice();
  }
});

// ═══════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════
function loop() {
  game.update();
  game.draw(ctx);
  requestAnimationFrame(loop);
}
loop();
