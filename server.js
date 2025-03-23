const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const userSocketMap = {};
// Add this storage for room messages
const roomMessages = {};

function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        
        // Initialize room messages if it doesn't exist
        if (!roomMessages[roomId]) {
            roomMessages[roomId] = [];
        }
        
        // Send message history to the new user
        socket.emit(ACTIONS.CHAT_HISTORY, {
            messages: roomMessages[roomId]
        });
        
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    // Updated handler for chat messages with persistence
    socket.on(ACTIONS.SEND_MESSAGE, ({ roomId, message }) => {
        // Create a message object with sender info and timestamp
        const messageObj = {
            content: message,
            sender: userSocketMap[socket.id],
            senderId: socket.id,
            timestamp: new Date().toISOString()
        };
        
        // Store the message in room history
        if (roomMessages[roomId]) {
            roomMessages[roomId].push(messageObj);
        }
        
        // Broadcast to everyone in the room
        io.in(roomId).emit(ACTIONS.RECEIVE_MESSAGE, messageObj);
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));