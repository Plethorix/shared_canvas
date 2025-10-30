class CollaborativeWhiteboard {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.currentColor = '#000000';
        this.currentLineWidth = 3;
        this.username = null;
        this.currentStroke = null;
        
        this.initializeApp();
        this.setupEventListeners();
        this.setupSocketEvents();
        this.resizeCanvas();
    }
    
    initializeApp() {
        const welcomeModal = document.getElementById('welcomeModal');
        const usernameForm = document.getElementById('usernameForm');
        
        usernameForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('usernameInput');
            const username = usernameInput.value.trim();
            
            if (username) {
                this.username = username;
                this.socket.emit('set-username', username);
                welcomeModal.style.display = 'none';
                this.focusMessageInput();
            }
        });
        
        document.getElementById('usernameInput').focus();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            this.currentColor = e.target.value;
        });
        
        document.getElementById('brushSize').addEventListener('input', (e) => {
            this.currentLineWidth = e.target.value;
            document.getElementById('brushSizeValue').textContent = `${e.target.value}px`;
        });
        
        document.getElementById('clearBtn').addEventListener('click', () => {
            if (confirm('¿Estás seguro de que quieres limpiar toda la pizarra?')) {
                this.socket.emit('clear-canvas');
            }
        });
        
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    setupSocketEvents() {
        // 🔥 NUEVOS EVENTOS PARA TRAZOS COMPLETOS
        this.socket.on('draw-start', (stroke) => {
            this.drawRemoteStrokeStart(stroke);
        });
        
        this.socket.on('draw-move', (data) => {
            this.drawRemoteStrokeMove(data);
        });
        
        this.socket.on('canvas-state', (state) => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            state.forEach(stroke => {
                this.drawCompleteStroke(stroke);
            });
        });
        
        this.socket.on('clear-canvas', (data) => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.addSystemMessage(`${data.username} limpió la pizarra`, data.timestamp);
        });
        
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data);
        });
        
        this.socket.on('user-joined', (data) => {
            this.addSystemMessage(data.message, data.timestamp);
        });
        
        this.socket.on('user-left', (data) => {
            this.addSystemMessage(data.message, data.timestamp);
        });
        
        this.socket.on('users-update', (data) => {
            this.updateUserCount(data);
        });
        
        this.socket.on('connect', () => {
            console.log('Conectado al servidor');
            if (this.username) {
                this.socket.emit('set-username', this.username);
            }
        });
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth - 4;
        this.canvas.height = container.clientHeight - 100;
        
        // Solicitar estado actual después de redimensionar
        if (this.socket.connected && this.username) {
            this.socket.emit('request-canvas-state');
        }
    }
    
    // 🔥 MÉTODOS DE DIBUJO CORREGIDOS
    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        
        // Configurar estilo de dibujo
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentLineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Empezar nuevo trazo
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
        
        // Enviar inicio de trazo al servidor
        this.socket.emit('draw-start', {
            x: pos.x,
            y: pos.y,
            color: this.currentColor, // Color original
            lineWidth: this.currentLineWidth
        });
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        e.preventDefault();
        const pos = this.getMousePos(e);
        
        // Dibujar localmente
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
        
        // Enviar punto al servidor
        this.socket.emit('draw-move', {
            x: pos.x,
            y: pos.y
        });
    }
    
    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.ctx.closePath();
            this.socket.emit('draw-end');
        }
    }
    
    // 🔥 MÉTODOS PARA DIBUJAR TRAZOS REMOTOS
    drawRemoteStrokeStart(stroke) {
        this.ctx.strokeStyle = stroke.color; // Usar color original del trazo
        this.ctx.lineWidth = stroke.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    }
    
    drawRemoteStrokeMove(data) {
        this.ctx.strokeStyle = data.color; // Color original del trazo
        this.ctx.lineWidth = data.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.lineTo(data.point.x, data.point.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(data.point.x, data.point.y);
    }
    
    drawCompleteStroke(stroke) {
        if (stroke.points.length < 2) return;
        
        this.ctx.strokeStyle = stroke.color; // Color original siempre
        this.ctx.lineWidth = stroke.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        for (let i = 1; i < stroke.points.length; i++) {
            this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        
        this.ctx.stroke();
    }
    
    // Métodos táctiles
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if (e.type.includes('touch')) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }
    
    // Métodos de chat (sin cambios)
    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (message && this.username) {
            this.socket.emit('chat-message', { message });
            messageInput.value = '';
        }
    }
    
    addChatMessage(data) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="username" style="color: ${data.color}">${data.username}</span>
                <span class="timestamp">${data.timestamp}</span>
            </div>
            <div class="message-content">${this.escapeHtml(data.message)}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    addSystemMessage(message, timestamp) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="username">Sistema</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message)}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    updateUserCount(data) {
        document.getElementById('userCount').textContent = 
            `${data.count} usuario${data.count !== 1 ? 's' : ''} conectado${data.count !== 1 ? 's' : ''}`;
        
        const onlineUsers = document.getElementById('onlineUsers');
        onlineUsers.innerHTML = data.users.map(user => 
            `<span style="color: ${user.color}">${user.username}</span>`
        ).join(', ');
    }
    
    focusMessageInput() {
        document.getElementById('messageInput').focus();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CollaborativeWhiteboard();
});
