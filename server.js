const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Estado en memoria
let canvasState = [];
let users = new Map();
let userCount = 0;

// Configuración de Socket.io
io.on('connection', (socket) => {
    console.log('Nuevo usuario conectado:', socket.id);
    
    // Evento cuando un usuario establece su nombre
    socket.on('set-username', (username) => {
        if (users.has(socket.id)) {
            return;
        }
        
        // Asignar color único al usuario
        const userColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
        const userColor = userColors[userCount % userColors.length];
        
        users.set(socket.id, {
            username: username,
            color: userColor,
            id: socket.id
        });
        userCount++;
        
        // Enviar estado actual del canvas al nuevo usuario
        socket.emit('canvas-state', canvasState);
        
        // Notificar a todos los usuarios sobre el nuevo usuario
        socket.broadcast.emit('user-joined', {
            username: username,
            message: `${username} se ha unido a la pizarra`,
            timestamp: new Date().toLocaleTimeString()
        });
        
        // Actualizar contador de usuarios para todos
        io.emit('users-update', {
            count: users.size,
            users: Array.from(users.values()).map(user => ({
                username: user.username,
                color: user.color
            }))
        });
        
        console.log(`Usuario ${username} (${socket.id}) se ha unido`);
    });
    
    // Manejar eventos de dibujo - CORREGIDO PARA MANTENER COLORES
    socket.on('draw', (data) => {
        // Validar datos
        if (isValidDrawData(data)) {
            // 🔥 CORRECCIÓN: Preservar el color original del dibujo
            const user = users.get(socket.id);
            if (user) {
                data.originalColor = data.color; // Guardar color original
                data.username = user.username;
            }
            
            canvasState.push(data);
            // Enviar a todos los demás clientes manteniendo el color original
            socket.broadcast.emit('draw', data);
        }
    });
    
    // Limpiar canvas
    socket.on('clear-canvas', () => {
        canvasState = [];
        const user = users.get(socket.id);
        io.emit('clear-canvas', {
            username: user ? user.username : 'Anónimo',
            timestamp: new Date().toLocaleTimeString()
        });
    });
    
    // Mensajes de chat
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
    
    // Manejar desconexión
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            users.delete(socket.id);
            
            // Notificar a los demás usuarios
            socket.broadcast.emit('user-left', {
                username: user.username,
                message: `${user.username} ha abandonado la pizarra`,
                timestamp: new Date().toLocaleTimeString()
            });
            
            // Actualizar contador de usuarios
            io.emit('users-update', {
                count: users.size,
                users: Array.from(users.values()).map(u => ({
                    username: u.username,
                    color: u.color
                }))
            });
            
            console.log(`Usuario ${user.username} (${socket.id}) se ha desconectado`);
        }
    });
});

// Validación de datos de dibujo
function isValidDrawData(data) {
    return (
        data &&
        typeof data.x === 'number' &&
        typeof data.y === 'number' &&
        typeof data.type === 'string' &&
        ['start', 'draw', 'end'].includes(data.type) &&
        typeof data.color === 'string' &&
        typeof data.lineWidth === 'number'
    );
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    console.log(`Accede a: http://localhost:${PORT}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    console.log(`Accede a: http://localhost:${PORT}`);
});
