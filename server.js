const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Inicializar Express y HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración del puerto para Render
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal - sirve el archivo HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Almacenamiento en memoria del estado del canvas
// En producción, considerar usar Redis o base de datos
let canvasState = {
    lines: [], // Almacena todas las líneas dibujadas
    users: 0   // Contador de usuarios conectados
};

// Configuración de Socket.io
io.on('connection', (socket) => {
    console.log(`🔗 Usuario conectado: ${socket.id}`);
    
    // Incrementar contador de usuarios
    canvasState.users++;
    console.log(`👥 Usuarios conectados: ${canvasState.users}`);
    
    // Emitir actualización del contador a todos los clientes
    io.emit('users update', canvasState.users);
    
    // Enviar el estado actual del canvas al nuevo usuario
    socket.emit('canvas state', canvasState.lines);
    
    // Manejar evento de dibujo
    socket.on('draw', (lineData) => {
        // Validar datos recibidos
        if (this.validateLineData(lineData)) {
            // Agregar línea al historial
            canvasState.lines.push(lineData);
            
            // Transmitir a todos los usuarios excepto al emisor
            socket.broadcast.emit('draw', lineData);
            
            console.log(`✏️ Línea dibujada por ${socket.id}`);
        }
    });
    
    // Manejar limpieza del canvas
    socket.on('clear canvas', () => {
        // Limpiar historial de líneas
        canvasState.lines = [];
        
        // Notificar a todos los clientes
        io.emit('canvas cleared');
        
        console.log(`🧹 Canvas limpiado por ${socket.id}`);
    });
    
    // Manejar desconexión de usuario
    socket.on('disconnect', () => {
        // Decrementar contador de usuarios
        canvasState.users = Math.max(0, canvasState.users - 1);
        
        // Emitir actualización
        io.emit('users update', canvasState.users);
        
        console.log(`❌ Usuario desconectado: ${socket.id}`);
        console.log(`👥 Usuarios restantes: ${canvasState.users}`);
    });
    
    // Manejar errores
    socket.on('error', (error) => {
        console.error(`❌ Error en socket ${socket.id}:`, error);
    });
});

// Validar datos de línea recibidos
function validateLineData(lineData) {
    return lineData && 
           Array.isArray(lineData.points) &&
           typeof lineData.color === 'string' &&
           typeof lineData.width === 'number' &&
           lineData.points.length >= 2;
}

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📱 Accede en: http://localhost:${PORT}`);
});

// Manejar cierre graceful del servidor
process.on('SIGTERM', () => {
    console.log('🛑 Recibido SIGTERM, cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});
