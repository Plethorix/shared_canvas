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

// Manejo de conexiones Socket.io
io.on('connection', (socket) => {
  console.log(`✅ Nueva conexión: ${socket.id}`);
  
  canvasState.users++;
  console.log(`👥 Usuarios conectados: ${canvasState.users}`);
  
  // Enviar estado actual al nuevo usuario
  socket.emit('canvas-state', canvasState.lines);
  
  // Actualizar contador para todos
  io.emit('users-update', canvasState.users);
  
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
  
  // Manejar ping/pong para mantener conexión
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log(`❌ Desconexión: ${socket.id}`);
    canvasState.users = Math.max(0, canvasState.users - 1);
    io.emit('users-update', canvasState.users);
  });
});

// Validación de datos
function validateLineData(lineData) {
  return lineData && 
         Array.isArray(lineData.points) &&
         typeof lineData.color === 'string' &&
         typeof lineData.width === 'number' &&
         lineData.points.length >= 2;
}

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor de pizarra colaborativa iniciado`);
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
