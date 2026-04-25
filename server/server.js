import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { LudoRoom } from './gameLogic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Allow CORS for development
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve frontend dist locally for production deployment
app.use(express.static(path.join(__dirname, '../website/dist')));
app.use(express.static(path.join(__dirname, '../website'))); // Fallback for local dev without dist

const rooms = new Map();

// Global active users map: uuid -> { socketId, name, lastSeen }
const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Global Registry
    socket.on('register-user', ({ uuid, name }) => {
        if (!uuid) return;
        socket.userUUID = uuid; // attach to socket for cleanup
        activeUsers.set(uuid, { socketId: socket.id, name, lastSeen: Date.now() });
    });

    // Check online status of friends
    socket.on('check-friends-status', ({ uuids }, callback) => {
        if (!Array.isArray(uuids)) return callback({});
        const statuses = {};
        for (const id of uuids) {
            statuses[id] = activeUsers.has(id);
        }
        callback(statuses);
    });

    // Direct Invite
    socket.on('invite-friend', ({ targetUUID, senderName, senderColor, roomId }) => {
        const target = activeUsers.get(targetUUID);
        if (target && target.socketId) {
            socket.to(target.socketId).emit('friend-invite', {
                senderName,
                senderColor,
                roomId
            });
        }
    });

    // Creates a new room
    socket.on('create-room', ({ name, count, teamUpMode }, callback) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const sessionId = randomUUID();
        
        const room = new LudoRoom(roomId, { playerCount: count || 4, teamUpMode: !!teamUpMode }, (event, data) => {
            io.to(roomId).emit(event, data);
        });
        rooms.set(roomId, room);
        
        // Join the room
        const player = room.joinPlayer(sessionId, name || 'Host', socket.id);
        socket.join(roomId);
        
        callback({ success: true, roomId, sessionId, playerColor: player.colorIndex });
        io.to(roomId).emit('room-update', { 
            players: room.players.map(p => ({
                name: p.name, 
                color: p.colorIndex, 
                online: p.isOnline, 
                botEnabled: p.botEnabled,
                socketId: p.socketId
            })) 
        });
    });

    // Joins an existing room
    socket.on('join-room', ({ roomId, name, sessionId }, callback) => {
        const room = rooms.get(roomId);
        if (!room) return callback({ success: false, error: 'Room not found' });

        if (!sessionId) sessionId = randomUUID();
        
        const player = room.joinPlayer(sessionId, name || 'Player', socket.id);
        if (!player) return callback({ success: false, error: 'Room is full or game in progress' });
        
        socket.join(roomId);
        // Save metadata on socket
        socket.roomId = roomId;
        socket.sessionId = sessionId;

        callback({ success: true, sessionId, playerColor: player.colorIndex, state: room.state });
        io.to(roomId).emit('room-update', { 
            players: room.players.map(p => ({
                name: p.name, 
                color: p.colorIndex, 
                online: p.isOnline, 
                botEnabled: p.botEnabled,
                socketId: p.socketId
            })) 
        });
    });

    // Start Game
    socket.on('start-game', ({ roomId, sessionId }) => {
        const room = rooms.get(roomId);
        if (room && room.players[0].sessionId === sessionId) {
            room.startGame();
        }
    });

    // Game Actions
    socket.on('roll-dice', ({ roomId, sessionId }) => {
        const room = rooms.get(roomId);
        if (room) room.handleRollDice(sessionId);
    });

    socket.on('move-token', ({ roomId, sessionId, tokenIndex, rollValue }) => {
        const room = rooms.get(roomId);
        if (room) room.handleMoveToken(sessionId, tokenIndex, rollValue);
    });

    socket.on('junction-choice', ({ roomId, sessionId, choice }) => {
        const room = rooms.get(roomId);
        if (room) room.handleJunctionChoice(sessionId, choice);
    });

    // Signaling for WebRTC
    socket.on('voice-signal', ({ roomId, toSocketId, signal }) => {
        socket.to(toSocketId).emit('voice-signal', { fromSocketId: socket.id, signal });
    });
    
    // Voice Status Update
    socket.on('voice-status', ({ roomId, sessionId, isMicOn }) => {
        const room = rooms.get(roomId);
        let color = -1;
        if (room) {
            const p = room.players.find(x => x.sessionId === sessionId);
            if (p) color = p.colorIndex;
        }
        socket.to(roomId).emit('peer-voice-status', { sessionId, color, isMicOn });
    });

    socket.on('chat-message', ({ roomId, message, color }) => {
        io.to(roomId).emit('chat-message', { message, color });
    });

    socket.on('toggle-bot', ({ roomId, sessionId, enabled }) => {
        const room = rooms.get(roomId);
        if (room) room.handleToggleBot(sessionId, enabled);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        if (socket.userUUID) {
            activeUsers.delete(socket.userUUID);
        }

        // Find which room this socket belonged to
        for (const [roomId, room] of rooms.entries()) {
            const player = room.players.find(p => p.socketId === socket.id);
            if (player) {
                room.disconnectPlayer(socket.id);
                io.to(roomId).emit('room-update', { 
                    players: room.players.map(p => ({
                        name: p.name, 
                        color: p.colorIndex, 
                        online: p.isOnline, 
                        botEnabled: p.botEnabled,
                        socketId: p.socketId
                    })) 
                });
                
                // Optional: Cleanup empty rooms after a few minutes
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Ludo server running on port ${PORT}`);
});
