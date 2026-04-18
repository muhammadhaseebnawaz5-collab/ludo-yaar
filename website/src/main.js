import { SCREEN_W, SCREEN_H, PLAYER_NAMES, PLAYER_COLORS, BOARD_X, BOARD_SIZE, BOARD_Y, PLAYER_ROTATIONS } from './constants.js';
import { LudoGame } from './game.js';
import { NetworkManager } from './network.js';

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

let game    = new LudoGame();
let network = new NetworkManager(game);
game.network = network;

// ═══════════════════════════════════════════
//  ELEMENTS
// ═══════════════════════════════════════════
const lobbyScreen      = document.getElementById('lobbyScreen');
const waitingRoom      = document.getElementById('waitingRoom');
const joinPopup        = document.getElementById('joinPopup');
const friendsPopup     = document.getElementById('friendsPopup');
const inviteBanner     = document.getElementById('inviteBanner');

const playerNameInput  = document.getElementById('playerNameInput');
const btnStart         = document.getElementById('btnStart');
const btnOpenJoin      = document.getElementById('btnOpenJoin');
const playerCountRow   = document.getElementById('playerCountRow');

const btnCloseJoin     = document.getElementById('btnCloseJoin');
const joinCodeInput    = document.getElementById('joinCodeInput');
const btnConfirmJoin   = document.getElementById('btnConfirmJoin');
const joinError        = document.getElementById('joinError');

const displayTableCode = document.getElementById('displayTableCode');
const btnCopyCode      = document.getElementById('btnCopyCode');
const copyConfirm      = document.getElementById('copyConfirm');
const slotsContainer   = document.getElementById('slots');
const btnInviteFriends = document.getElementById('btnInviteFriends');
const btnShare         = document.getElementById('btnShare');
const btnStartGame     = document.getElementById('btnStartGame');
const waitP            = document.getElementById('waitP');

const btnCloseFriends  = document.getElementById('btnCloseFriends');
const friendsList      = document.getElementById('friendsList');
const noFriendsMsg     = document.getElementById('noFriendsMsg');
const friendSearchInput = document.getElementById('friendSearchInput');

const btnAcceptInvite  = document.getElementById('btnAcceptInvite');
const btnDeclineInvite = document.getElementById('btnDeclineInvite');
const ibSenderName     = document.getElementById('ibSenderName');

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let selectedCount = 2;
let isHost        = false;
let pendingInvite = null; // { roomId, senderName }
let teamUpMode    = false;

// ═══════════════════════════════════════════
//  PLAYER COUNT SELECTION
// ═══════════════════════════════════════════
playerCountRow.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        playerCountRow.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCount = parseInt(btn.dataset.count);
        
        // Update Team Up visibility based on player count (only for 4 players)
        const teamUpBtn = document.getElementById('btnTeamUp');
        if (selectedCount === 4) {
            teamUpBtn.classList.remove('hidden');
        } else {
            teamUpBtn.classList.add('hidden');
            teamUpMode = false;
            updateTeamUpBtnUI();
        }
    });
});

// Team Up Toggle
const btnTeamUp = document.getElementById('btnTeamUp');
btnTeamUp.addEventListener('click', () => {
    teamUpMode = !teamUpMode;
    updateTeamUpBtnUI();
});

function updateTeamUpBtnUI() {
    btnTeamUp.textContent = teamUpMode ? '✅ TEAM UP ON' : '👥 TEAM UP';
    btnTeamUp.style.background = teamUpMode ? '#28A33E' : '#3A1060';
}

// ═══════════════════════════════════════════
//  SCREEN HELPERS
// ═══════════════════════════════════════════
function showScreen(el) {
    [lobbyScreen, waitingRoom].forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    el.classList.remove('hidden');
    el.classList.add('active');
}

function showPopup(el)  { el.classList.remove('hidden'); }
function hidePopup(el)  { el.classList.add('hidden'); }

// ═══════════════════════════════════════════
//  LOBBY — START
// ═══════════════════════════════════════════
btnStart.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Host';
    btnStart.disabled = true;
    btnStart.textContent = '⏳ Creating…';

    network.createRoom(name, selectedCount, teamUpMode, (res) => {
        btnStart.disabled = false;
        btnStart.textContent = '▶ START';
        if (res.success) {
            isHost = true;
            enterWaitingRoom(res.roomId, name, true);
        }
    });
});

// ═══════════════════════════════════════════
//  LOBBY — JOIN (open popup)
// ═══════════════════════════════════════════
btnOpenJoin.addEventListener('click', () => {
    joinError.classList.add('hidden');
    joinCodeInput.value = '';
    showPopup(joinPopup);
    setTimeout(() => joinCodeInput.focus(), 100);
});
btnCloseJoin.addEventListener('click', () => hidePopup(joinPopup));

btnConfirmJoin.addEventListener('click', attemptJoin);
joinCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptJoin(); });

function attemptJoin() {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) return;
    const name = playerNameInput.value.trim() || 'Player';
    joinError.classList.add('hidden');
    btnConfirmJoin.disabled = true;
    btnConfirmJoin.textContent = 'Joining…';

    network.joinRoom(code, name, (res) => {
        btnConfirmJoin.disabled = false;
        btnConfirmJoin.textContent = 'Join Table';
        if (res.success) {
            hidePopup(joinPopup);
            isHost = false;
            enterWaitingRoom(code, name, false);
            if (res.state && res.state.gameState !== 'lobby') {
                // Reconnected to an active game → skip waiting room
                startGame(res.state);
            }
        } else {
            joinError.textContent = res.error || 'Code not found. Check and try again.';
            joinError.classList.remove('hidden');
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
        btnStartGame.classList.remove('hidden');
        waitP.classList.add('hidden');
    } else {
        btnStartGame.classList.add('hidden');
        waitP.classList.remove('hidden');
    }

    // Register this user globally with server for direct invites
    network.registerUser(myName);

    // Store in friends → they'll see us as online
    updateWaitSlots([{ name: myName, color: network.playerColor, isYou: true }]);
}

/** Called by network when room-update fires */
game.updateLobbyPlayers = function(players) {
    const myColor = network.playerColor;
    const totalNeeded = selectedCount;

    const slots = players.map(p => ({
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

    // Auto-save any new friends we played with
    players.forEach(p => {
        if (p.color !== myColor) addFriend(p.name, p.color, network.theirSessionId || null);
    });

    // Auto-start when full
    if (isHost && players.length === totalNeeded) {
        setTimeout(() => network.startGame(), 800);
    }
};

function updateWaitSlots(slots) {
    slotsContainer.innerHTML = '';
    slots.forEach(slot => {
        const div = document.createElement('div');
        div.className = 'player-slot';

        const avatar = document.createElement('div');
        const label  = document.createElement('div');
        label.className = 'slot-label';

        if (slot.empty) {
            avatar.className = 'slot-avatar empty';
            avatar.textContent = '+';
            label.textContent = 'Waiting…';
        } else if (slot.inviting) {
            avatar.className = `slot-avatar inviting color-${slot.colorIndex ?? 0}`;
            avatar.textContent = '⏳';
            label.textContent = 'Inviting…';
        } else {
            avatar.className = `slot-avatar filled color-${slot.colorIndex ?? 0}`;
            avatar.textContent = (slot.name || '?')[0].toUpperCase();
            label.className   = `slot-label${slot.isYou ? ' you' : ''}`;
            label.textContent = slot.isYou ? 'You' : slot.name;
        }

        div.appendChild(avatar);
        div.appendChild(label);
        slotsContainer.appendChild(div);
    });
}

// Copy code
btnCopyCode.addEventListener('click', () => {
    const code = displayTableCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
        copyConfirm.classList.remove('hidden');
        setTimeout(() => copyConfirm.classList.add('hidden'), 1800);
    });
});

// Share
btnShare.addEventListener('click', () => {
    const code = displayTableCode.textContent;
    const url  = `${location.origin}?join=${code}`;
    if (navigator.share) {
        navigator.share({ title: 'Join my Ludo table!', text: `Use code: ${code}`, url });
    } else {
        navigator.clipboard.writeText(`Join my Ludo table! Code: ${code}\n${url}`);
        copyConfirm.textContent = 'Link copied!';
        copyConfirm.classList.remove('hidden');
        setTimeout(() => { copyConfirm.classList.add('hidden'); copyConfirm.textContent = 'Copied!'; }, 1800);
    }
});

// Host: manual start
btnStartGame.addEventListener('click', () => {
    network.startGame();
});

// ═══════════════════════════════════════════
//  FRIENDS SYSTEM
// ═══════════════════════════════════════════

/** Friends stored in localStorage as array of { uuid, name, colorIndex, lastSeen } */
function getFriends() {
    try { return JSON.parse(localStorage.getItem('ludoFriends') || '[]'); } catch { return []; }
}
function saveFriends(list) {
    localStorage.setItem('ludoFriends', JSON.stringify(list));
}
function addFriend(name, colorIndex, uuid) {
    const list = getFriends();
    const existing = list.find(f => f.name === name);
    if (existing) {
        existing.lastSeen = Date.now();
        if (uuid) existing.uuid = uuid;
    } else {
        list.push({ uuid: uuid || `local-${Date.now()}`, name, colorIndex: colorIndex ?? 0, lastSeen: Date.now() });
    }
    saveFriends(list);
}

// Open friends popup
btnInviteFriends.addEventListener('click', () => {
    renderFriendsList();
    showPopup(friendsPopup);
});
btnCloseFriends.addEventListener('click', () => hidePopup(friendsPopup));

friendSearchInput.addEventListener('input', renderFriendsList);

function renderFriendsList(onlineSessions) {
    const q = (friendSearchInput.value || '').trim().toLowerCase();
    let friends = getFriends().filter(f => !q || f.name.toLowerCase().includes(q));

    // Merge online status from server response if available
    const onlineMap = window._onlineFriends || {};

    // Sort: online first
    friends.sort((a, b) => {
        const ao = !!onlineMap[a.uuid];
        const bo = !!onlineMap[b.uuid];
        return ao === bo ? (b.lastSeen - a.lastSeen) : (bo ? 1 : -1);
    });

    friendsList.innerHTML = '';

    if (friends.length === 0) {
        noFriendsMsg.classList.remove('hidden');
    } else {
        noFriendsMsg.classList.add('hidden');
        friends.forEach(f => {
            const isOnline = !!onlineMap[f.uuid];
            const lastSeenText = isOnline ? 'Online' : friendLastSeen(f.lastSeen);

            const li = document.createElement('li');
            li.className = 'friend-item';
            li.innerHTML = `
                <div class="fi-avatar color-${f.colorIndex}">${f.name[0].toUpperCase()}</div>
                <div class="fi-info">
                    <div class="fi-name">${f.name}</div>
                    <div class="fi-status ${isOnline ? 'online' : 'offline'}">${lastSeenText}</div>
                </div>
                <button class="fi-invite-btn" ${!isOnline ? 'disabled' : ''} data-uuid="${f.uuid}">
                    ${isOnline ? 'Invite' : 'Offline'}
                </button>`;
            li.querySelector('.fi-invite-btn').addEventListener('click', () => {
                inviteFriend(f);
                li.querySelector('.fi-invite-btn').textContent = 'Sent ✓';
                li.querySelector('.fi-invite-btn').disabled = true;
            });
            friendsList.appendChild(li);
        });
    }

    // Ask server for realtime online statuses
    const uuids = getFriends().map(f => f.uuid).filter(Boolean);
    if (uuids.length) {
        network.checkFriendsStatus(uuids, (statuses) => {
            window._onlineFriends = statuses; // { uuid: true/false }
            renderFriendsList(); // re-render with fresh status
        });
    }
}

function friendLastSeen(ts) {
    if (!ts) return 'Offline';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return `${Math.floor(hrs/24)}d ago`;
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
    const empties = slotsContainer.querySelectorAll('.slot-avatar.empty');
    if (empties.length === 0) return;
    const avatar = empties[0];
    const label  = avatar.parentElement.querySelector('.slot-label');
    avatar.className = `slot-avatar inviting color-${colorIndex}`;
    avatar.textContent = '⏳';
    if (label) { label.textContent = 'Inviting…'; }
}


// ═══════════════════════════════════════════
//  INCOMING INVITE
// ═══════════════════════════════════════════

/** Called by network when a 'friend-invite' event is received */
network.onFriendInvite = function({ senderName, senderColor, roomId }) {
    pendingInvite = { roomId, senderName };
    ibSenderName.textContent = senderName;
    document.getElementById('ibAvatar').textContent = senderName[0].toUpperCase();
    document.getElementById('ibAvatar').className = `ib-avatar color-${senderColor ?? 0}`;
    inviteBanner.classList.remove('hidden');

    // Auto-dismiss after 15 seconds
    clearTimeout(inviteBanner._dismissTimer);
    inviteBanner._dismissTimer = setTimeout(() => inviteBanner.classList.add('hidden'), 15000);
};

btnAcceptInvite.addEventListener('click', () => {
    if (!pendingInvite) return;
    inviteBanner.classList.add('hidden');
    const name = playerNameInput.value.trim() || 'Player';
    network.joinRoom(pendingInvite.roomId, name, (res) => {
        if (res.success) {
            isHost = false;
            enterWaitingRoom(pendingInvite.roomId, name, false);
            if (res.state && res.state.gameState !== 'lobby') {
                startGame(res.state);
            }
        } else {
            alert(res.error || 'Could not join table');
        }
    });
    pendingInvite = null;
});

btnDeclineInvite.addEventListener('click', () => {
    inviteBanner.classList.add('hidden');
    pendingInvite = null;
});


// ═══════════════════════════════════════════
//  GAME START
// ═══════════════════════════════════════════

/** Called when the server fires game-started */
game.startGameFromServer = function(state) {
    hidePopup(friendsPopup);
    waitingRoom.classList.add('hidden');
    waitingRoom.classList.remove('active');
    game.syncState(state);
    game.gameState = state.gameState;
};

function startGame(state) {
    game.startGameFromServer(state);
}

// Auto-join from URL param (e.g. shared link)
(function checkUrlJoin() {
    const params = new URLSearchParams(location.search);
    const code = params.get('join');
    if (code) {
        joinCodeInput.value = code;
        showPopup(joinPopup);
    }
})();


// ═══════════════════════════════════════════
//  CANVAS RESIZE
// ═══════════════════════════════════════════
function resize() {
    const windowRatio = window.innerWidth / window.innerHeight;
    const gameRatio   = SCREEN_W / SCREEN_H;
    if (windowRatio > gameRatio) {
        canvas.style.height = '100vh';
        canvas.style.width  = 'auto';
    } else {
        canvas.style.width  = '100vw';
        canvas.style.height = 'auto';
    }
    canvas.width  = SCREEN_W;
    canvas.height = SCREEN_H;
}
window.addEventListener('resize', resize);
resize();


// ═══════════════════════════════════════════
//  INPUT HANDLING
// ═══════════════════════════════════════════
function getPos(e) {
    const rect   = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [
        (clientX - rect.left) * (SCREEN_W / rect.width),
        (clientY - rect.top)  * (SCREEN_H / rect.height),
    ];
}

function handleInput(e) {
    e.preventDefault();
    const [sx, sy] = getPos(e);

    // --- COORDINATE UN-ROTATION FOR BOARD CLICKS ---
    const bcx = BOARD_X + BOARD_SIZE / 2;
    const bcy = BOARD_Y + BOARD_SIZE / 2;
    const angle = PLAYER_ROTATIONS[game.clientPlayer] || 0;
    
    // Rotate point (sx, sy) by -angle around (bcx, bcy)
    const dx = sx - bcx;
    const dy = sy - bcy;
    const lx = bcx + dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const ly = bcy + dx * Math.sin(-angle) + dy * Math.cos(-angle);
    // ----------------------------------------------

    const moveOption = game.moveSelection.handleClick(lx, ly);
    if (moveOption !== null) {
        const token = game.moveSelection.activeToken;
        game.moveSelection.hide();
        network.moveToken(token.index, moveOption);
        return;
    }

    const junctionChoice = game.junctionArrows.handleClick(lx, ly);
    if (junctionChoice !== null) {
        const token = game.junctionArrows.activeToken;
        game.junctionArrows.hide();
        token.decisionPending = false;
        network.selectJunction(junctionChoice);
        return;
    }

    // Emoji button
    if (sx >= 12 && sx <= 84 && sy >= SCREEN_H-34 && sy <= SCREEN_H-6) {
        game.emojiPanel.visible = !game.emojiPanel.visible;
        game.chat.visible = false;
        return;
    }
    // Chat button
    if (sx >= 92 && sx <= 164 && sy >= SCREEN_H-34 && sy <= SCREEN_H-6) {
        game.chat.visible  = !game.chat.visible;
        game.chat.active   = game.chat.visible;
        game.emojiPanel.visible = false;
        return;
    }

    // Crown / Roll
    {
        const p       = game.currentPlayer;
        const v       = game.getVisualIndex(p);
        const isTop   = v <= 1;
        const isRight = v === 1 || v === 2;
        const clX = isRight ? SCREEN_W - 238 : 92;
        const clY = isTop ? 18 : SCREEN_H - 152;
        const crX = clX + 62, crY = clY + 23;
        if (Math.hypot(sx - crX, sy - crY) <= 24) {
            if (game.currentPlayer === network.playerColor) {
                network.rollDice();
            }
            return;
        }
    }

    if (sx >= 172 && sx <= 244 && sy >= SCREEN_H-34 && sy <= SCREEN_H-6) {
        network.toggleMic().then(isOn => { game.localMicMuted = !isOn; });
        return;
    }
    if (sx >= 252 && sx <= 324 && sy >= SCREEN_H-34 && sy <= SCREEN_H-6) {
        game.speakerPanelVisible = !game.speakerPanelVisible;
        return;
    }

    // Use logical coordinates (lx, ly) for board-related clicks
    game.handleTokenClick(lx, ly);

    if (game.emojiPanel.visible) {
        const eyBase = 480, exBase = 20;
        const { cols, pad, size } = game.emojiPanel.getEmojiGridBounds(exBase, eyBase);
        for (let i = 0; i < Math.min(game.emojiPanel.emojis.length, cols * 3); i++) {
            const ex = exBase + pad + (i % cols) * (size + pad) + size / 2;
            const ey = eyBase + pad + Math.floor(i / cols) * (size + pad) + size / 2;
            if (Math.abs(sx - ex) < size/2 && Math.abs(sy - ey) < size/2) {
                const emoji = game.emojiPanel.emojis[i];
                game.emojiPanel.displayEmoji   = emoji;
                game.emojiPanel.displayTimer   = 90;
                game.emojiPanel.displayPos     = [SCREEN_W / 2, 400];
                game.emojiPanel.visible        = false;
                game.chat.addMessage(PLAYER_NAMES[network.playerColor] || 'Me', emoji, PLAYER_COLORS[network.playerColor]);
                network.sendChat(emoji, PLAYER_NAMES[network.playerColor] || 'Me', PLAYER_COLORS[network.playerColor]);
            }
        }
    }
}

canvas.addEventListener('mousedown',  handleInput);
canvas.addEventListener('touchstart', handleInput, { passive: false });

window.addEventListener('keydown', e => {
    if (game.chat.active) {
        if (e.key === 'Enter') {
            if (game.chat.inputText) {
                const pColor = network.playerColor !== null ? network.playerColor : 0;
                const pName  = PLAYER_NAMES[pColor] || 'Me';
                game.chat.addMessage(pName, game.chat.inputText, PLAYER_COLORS[pColor]);
                network.sendChat(game.chat.inputText, pName, PLAYER_COLORS[pColor]);
                game.chat.inputText = '';
            }
        } else if (e.key === 'Backspace') {
            game.chat.inputText = game.chat.inputText.slice(0, -1);
        } else if (e.key.length === 1) {
            game.chat.inputText += e.key;
        }
    } else if (e.key === ' ' && game.currentPlayer === network.playerColor) {
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
