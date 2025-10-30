const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io para producción
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Middleware para archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint para Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Servidor de pizarra colaborativa funcionando',
    timestamp: new Date().toISOString(),
    users: canvasState.users
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Estado del canvas en memoria
let canvasState = {
  lines: [],
  users: 0
};

// No almacenamos mensajes del chat en el servidor
let connectedUsers = new Map();

// Manejo de conexiones Socket.io
io.on('connection', (socket) => {
  console.log(`✅ Nueva conexión: ${socket.id}`);
  
  canvasState.users++;
  connectedUsers.set(socket.id, { id: socket.id, connectedAt: new Date() });
  
  console.log(`👥 Usuarios conectados: ${canvasState.users}`);
  
  // Enviar estado actual al nuevo usuario
  socket.emit('canvas-state', canvasState.lines);
  
  // Actualizar contador para todos
  io.emit('users-update', canvasState.users);
  
  // Notificar a todos que un nuevo usuario se unió
  socket.broadcast.emit('user-joined', `Usuario ${canvasState.users} se unió a la pizarra`);
  
  // Manejar dibujo
  socket.on('draw', (lineData) => {
    if (validateLineData(lineData)) {
      canvasState.lines.push(lineData);
      socket.broadcast.emit('draw', lineData);
    }
  });
  
  // Manejar limpieza
  socket.on('clear-canvas', () => {
    canvasState.lines = [];
    io.emit('canvas-cleared');
    console.log(`🧹 Canvas limpiado por ${socket.id}`);
  });
  
  // Manejar mensajes de chat
  socket.on('chat-message', (messageData) => {
    // Validar mensaje
    if (validateMessageData(messageData)) {
      // Transmitir mensaje a todos los usuarios incluyendo el emisor
      io.emit('chat-message', {
        ...messageData,
        timestamp: new Date().toISOString(),
        userId: socket.id
      });
    }
  });
  
  // Manejar ping/pong para mantener conexión
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log(`❌ Desconexión: ${socket.id}`);
    canvasState.users = Math.max(0, canvasState.users - 1);
    connectedUsers.delete(socket.id);
    
    io.emit('users-update', canvasState.users);
    socket.broadcast.emit('user-left', `Un usuario abandonó la pizarra`);
  });
});

// Validación de datos de dibujo
function validateLineData(lineData) {
  return lineData && 
         Array.isArray(lineData.points) &&
         typeof lineData.color === 'string' &&
         typeof lineData.width === 'number' &&
         lineData.points.length >= 2;
}

// Validación de datos de mensaje
function validateMessageData(messageData) {
  return messageData && 
         typeof messageData.text === 'string' &&
         messageData.text.trim().length > 0 &&
         messageData.text.length <= 500 && // Límite de caracteres
         typeof messageData.username === 'string' &&
         messageData.username.trim().length > 0;
}

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor de pizarra colaborativa con chat iniciado`);
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🌐 Modo: ${process.env.NODE_ENV || 'development'}`);
});

// Manejo graceful de shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recibida señal de terminación');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});
