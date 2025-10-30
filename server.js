const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// Estado en memoria
let canvasState = [];
let users = new Map();
let userCount = 0;

io.on('connection', (socket) => {
    console.log('Nuevo usuario conectado:', socket.id);
    
    socket.on('set-username', (username) => {
        if (users.has(socket.id)) {
            return;
        }
        
        const userColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
        const userColor = userColors[userCount % userColors.length];
        
        users.set(socket.id, {
            username: username,
            color: userColor,
            id: socket.id
        });
        userCount++;
        
        // Enviar estado actual del canvas
        socket.emit('canvas-state', canvasState);
        
        socket.broadcast.emit('user-joined', {
            username: username,
            message: `${username} se ha unido a la pizarra`,
            timestamp: new Date().toLocaleTimeString()
        });
        
        io.emit('users-update', {
            count: users.size,
            users: Array.from(users.values()).map(user => ({
                username: user.username,
                color: user.color
            }))
        });
    });
    
    // 🔥 CORRECCIÓN COMPLETA: Manejar trazos completos
    socket.on('draw-start', (data) => {
        const user = users.get(socket.id);
        if (user) {
            // Crear un nuevo trazo con color original
            const stroke = {
                points: [{ x: data.x, y: data.y }],
                color: data.color, // Color original del dibujo
                lineWidth: data.lineWidth,
                username: user.username,
                userId: socket.id,
                id: Date.now() + Math.random() // ID único para el trazo
            };
            canvasState.push(stroke);
            
            // Enviar a otros usuarios
            socket.broadcast.emit('draw-start', stroke);
        }
    });
    
    socket.on('draw-move', (data) => {
        const user = users.get(socket.id);
        if (user) {
            // Buscar el último trazo de este usuario
            const lastStroke = canvasState
                .filter(stroke => stroke.userId === socket.id)
                .pop();
            
            if (lastStroke) {
                // Agregar punto al trazo existente
                lastStroke.points.push({ x: data.x, y: data.y });
                
                // Enviar a otros usuarios
                socket.broadcast.emit('draw-move', {
                    strokeId: lastStroke.id,
                    point: { x: data.x, y: data.y },
                    color: lastStroke.color, // Mantener color original
                    lineWidth: lastStroke.lineWidth
                });
            }
        }
    });
    
    socket.on('draw-end', () => {
        // No necesitamos hacer nada especial al terminar
        console.log('Trazo completado');
    });
    
    socket.on('clear-canvas', () => {
        canvasState = [];
        const user = users.get(socket.id);
        io.emit('clear-canvas', {
            username: user ? user.username : 'Anónimo',
            timestamp: new Date().toLocaleTimeString()
        });
    });
    
    socket.on('chat-message', (messageData) => {
        const user = users.get(socket.id);
        if (user && messageData.message && messageData.message.trim() !== '') {
            const chatData = {
                username: user.username,
                message: messageData.message.trim(),
                color: user.color,
                timestamp: new Date().toLocaleTimeString(),
                type: 'message'
            };
            io.emit('chat-message', chatData);
        }
    });
    
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            users.delete(socket.id);
            
            socket.broadcast.emit('user-left', {
                username: user.username,
                message: `${user.username} ha abandonado la pizarra`,
                timestamp: new Date().toLocaleTimeString()
            });
            
            io.emit('users-update', {
                count: users.size,
                users: Array.from(users.values()).map(u => ({
                    username: u.username,
                    color: u.color
                }))
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
});
