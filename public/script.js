/**
 * Pizarra Colaborativa con Chat
 * Versión completa con funcionalidades de dibujo y chat
 */
class PizarraColaborativa {
    constructor() {
        this.canvas = document.getElementById('pizarra');
        this.ctx = this.canvas.getContext('2d');
        this.socket = null;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.currentColor = '#ff0000';
        this.brushSize = 5;
        this.currentLine = [];
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 10;
        this.username = 'Usuario';
        
        this.initializeApp();
    }
    
    initializeApp() {
        this.setupCanvas();
        this.setupEventListeners();
        this.initializeSocket();
        this.setupUIUpdates();
        this.setupChat();
        
        console.log('🎨💬 Pizarra colaborativa con chat inicializada');
    }
    
    setupCanvas() {
        const container = document.querySelector('.canvas-container');
        const maxWidth = Math.min(800, container.clientWidth - 40);
        const maxHeight = Math.min(600, window.innerHeight - 300);
        
        this.canvas.width = maxWidth;
        this.canvas.height = maxHeight;
        
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = this.brushSize;
        this.ctx.strokeStyle = this.currentColor;
        
        // Fondo blanco
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    setupEventListeners() {
        // Eventos de mouse para dibujo
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Eventos táctiles para dibujo
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        
        // Controles de dibujo
        document.getElementById('colorPicker').addEventListener('input', this.handleColorChange.bind(this));
        document.getElementById('brushSize').addEventListener('input', this.handleBrushSizeChange.bind(this));
        document.getElementById('clearBtn').addEventListener('click', this.handleClearCanvas.bind(this));
        
        // Redimensionado
        window.addEventListener('resize', this.handleResize.bind(this));
    }
    
    setupChat() {
        // Configurar nombre de usuario
        const usernameInput = document.getElementById('usernameInput');
        usernameInput.value = this.username;
        usernameInput.addEventListener('change', (e) => {
            this.username = e.target.value.trim() || 'Usuario';
        });
        
        // Configurar envío de mensajes
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendMessageBtn');
        
        const sendMessage = () => {
            const text = messageInput.value.trim();
            if (text && this.socket?.connected) {
                this.sendChatMessage(text);
                messageInput.value = '';
            }
        };
        
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    initializeSocket() {
        console.log('🔌 Iniciando conexión...');
        this.showLoadingMessage('Conectando con la pizarra...');
        
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnectionAttempts: this.maxReconnectionAttempts
            });
            
            this.setupSocketEvents();
            
        } catch (error) {
            console.error('💥 Error al inicializar Socket.io:', error);
            this.showLoadingMessage('Error de conexión. Recarga la página.');
        }
    }
    
    setupSocketEvents() {
        // Conexión establecida
        this.socket.on('connect', () => {
            console.log('✅ Conexión establecida con el servidor');
            this.updateConnectionStatus(true);
            this.hideLoadingMessage();
            this.reconnectionAttempts = 0;
        });
        
        // Desconexión
        this.socket.on('disconnect', (reason) => {
            console.log('❌ Desconectado:', reason);
            this.updateConnectionStatus(false);
            this.showLoadingMessage('Reconectando...');
        });
        
        // Error de conexión
        this.socket.on('connect_error', (error) => {
            this.reconnectionAttempts++;
            console.error(`💥 Error de conexión (intento ${this.reconnectionAttempts}):`, error);
            
            if (this.reconnectionAttempts <= this.maxReconnectionAttempts) {
                this.showLoadingMessage(`Conectando... (${this.reconnectionAttempts}/${this.maxReconnectionAttempts})`);
            } else {
                this.showLoadingMessage('No se pudo conectar. Verifica tu conexión e intenta recargar.');
            }
        });
        
        // Reconexión exitosa
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔁 Reconectado después de ${attemptNumber} intentos`);
            this.updateConnectionStatus(true);
            this.hideLoadingMessage();
        });
        
        // Estado del canvas al conectar
        this.socket.on('canvas-state', (lines) => {
            console.log(`📊 Canvas sincronizado: ${lines.length} elementos`);
            this.redrawCanvas(lines);
        });
        
        // Dibujos de otros usuarios
        this.socket.on('draw', (lineData) => {
            this.drawRemoteLine(lineData);
        });
        
        // Canvas limpiado
        this.socket.on('canvas-cleared', () => {
            this.clearLocalCanvas();
            console.log('🧹 Canvas limpiado por otro usuario');
        });
        
        // Actualización de usuarios
        this.socket.on('users-update', (userCount) => {
            this.updateUserCount(userCount);
        });
        
        // Mensajes de chat
        this.socket.on('chat-message', (messageData) => {
            this.displayChatMessage(messageData);
        });
        
        // Usuario se unió
        this.socket.on('user-joined', (message) => {
            this.displaySystemMessage(message);
        });
        
        // Usuario abandonó
        this.socket.on('user-left', (message) => {
            this.displaySystemMessage(message);
        });
    }
    
    // Métodos de dibujo (sin cambios)
    startDrawing(e) {
        if (!this.socket?.connected) {
            this.showLoadingMessage('Esperando conexión...');
            return;
        }
        
        this.isDrawing = true;
        const point = this.getCanvasCoordinates(e);
        [this.lastX, this.lastY] = [point.x, point.y];
        
        this.currentLine = [{
            x: point.x,
            y: point.y,
            color: this.currentColor,
            width: this.brushSize
        }];
    }
    
    draw(e) {
        if (!this.isDrawing || !this.socket?.connected) return;
        
        e.preventDefault();
        const point = this.getCanvasCoordinates(e);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(point.x, point.y);
        this.ctx.stroke();
        
        [this.lastX, this.lastY] = [point.x, point.y];
        
        this.currentLine.push({
            x: point.x,
            y: point.y,
            color: this.currentColor,
            width: this.brushSize
        });
    }
    
    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        if (this.currentLine.length > 1 && this.socket?.connected) {
            this.socket.emit('draw', {
                points: this.currentLine,
                color: this.currentColor,
                width: this.brushSize
            });
        }
        
        this.currentLine = [];
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        this.startDrawing(e.touches[0]);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        this.draw(e.touches[0]);
    }
    
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    handleColorChange(e) {
        this.currentColor = e.target.value;
        this.ctx.strokeStyle = this.currentColor;
    }
    
    handleBrushSizeChange(e) {
        this.brushSize = parseInt(e.target.value);
        this.ctx.lineWidth = this.brushSize;
        this.updateBrushSizeDisplay();
    }
    
    handleClearCanvas() {
        if (!this.socket?.connected) {
            alert('No hay conexión con el servidor');
            return;
        }
        
        if (confirm('¿Estás seguro de que quieres limpiar toda la pizarra para todos los usuarios?')) {
            this.clearLocalCanvas();
            this.socket.emit('clear-canvas');
        }
    }
    
    clearLocalCanvas() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    redrawCanvas(lines) {
        this.clearLocalCanvas();
        lines.forEach(lineData => {
            this.drawRemoteLine(lineData);
        });
    }
    
    drawRemoteLine(lineData) {
        if (!lineData.points || lineData.points.length < 2) return;
        
        const originalColor = this.ctx.strokeStyle;
        const originalWidth = this.ctx.lineWidth;
        
        this.ctx.strokeStyle = lineData.color;
        this.ctx.lineWidth = lineData.width;
        
        this.ctx.beginPath();
        this.ctx.moveTo(lineData.points[0].x, lineData.points[0].y);
        
        for (let i = 1; i < lineData.points.length; i++) {
            this.ctx.lineTo(lineData.points[i].x, lineData.points[i].y);
        }
        
        this.ctx.stroke();
        
        this.ctx.strokeStyle = originalColor;
        this.ctx.lineWidth = originalWidth;
    }
    
    // Métodos de chat
    sendChatMessage(text) {
        const messageData = {
            text: text,
            username: this.username,
            timestamp: new Date().toISOString()
        };
        
        this.socket.emit('chat-message', messageData);
        
        // Mostrar mensaje localmente inmediatamente
        this.displayChatMessage({
            ...messageData,
            userId: this.socket.id,
            isLocal: true
        });
    }
    
    displayChatMessage(messageData) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        
        const isOwnMessage = messageData.userId === this.socket.id || messageData.isLocal;
        const messageClass = isOwnMessage ? 'message message-user' : 'message message-other';
        
        const time = new Date(messageData.timestamp).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageElement.className = messageClass;
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-username">${this.escapeHtml(messageData.username)}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${this.escapeHtml(messageData.text)}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Limitar número de mensajes para evitar sobrecarga
        const messages = chatMessages.querySelectorAll('.message');
        if (messages.length > 100) {
            messages[0].remove();
        }
    }
    
    displaySystemMessage(text) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        
        messageElement.className = 'message message-system';
        messageElement.textContent = text;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Métodos de UI
    updateBrushSizeDisplay() {
        document.getElementById('brushSizeValue').textContent = `${this.brushSize}px`;
    }
    
    updateUserCount(count) {
        document.getElementById('usersCount').textContent = count;
        document.getElementById('chatUsersCount').textContent = count;
    }
    
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (connected) {
            statusElement.textContent = '● Conectado';
            statusElement.className = 'status-connected';
        } else {
            statusElement.textContent = '● Desconectado';
            statusElement.className = 'status-disconnected';
        }
    }
    
    showLoadingMessage(message = 'Conectando...') {
        const loadingElement = document.getElementById('loadingMessage');
        loadingElement.classList.remove('hidden');
        loadingElement.querySelector('p').textContent = message;
    }
    
    hideLoadingMessage() {
        document.getElementById('loadingMessage').classList.add('hidden');
    }
    
    handleResize() {
        setTimeout(() => {
            this.setupCanvas();
        }, 250);
    }
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    new PizarraColaborativa();
});

// Manejar errores globales
window.addEventListener('error', (e) => {
    console.error('Error global:', e.error);
});
