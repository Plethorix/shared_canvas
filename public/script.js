class CollaborativeWhiteboard {
    constructor() {
        this.socket = io();
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.currentColor = '#000000';
        this.currentLineWidth = 3;
        this.username = null;
        
        this.initializeApp();
        this.setupEventListeners();
        this.setupSocketEvents();
        this.resizeCanvas();
    }
    
    initializeApp() {
        // Mostrar modal de bienvenida
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
        
        // Enfocar input de usuario al cargar
        document.getElementById('usernameInput').focus();
    }
    
    setupEventListeners() {
        // Eventos del canvas
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Eventos táctiles
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        
        // Herramientas de dibujo
        document.getElementById('colorPicker').addEventListener('input', (e) => {
            this.currentColor = e.target.value;
        });
        
        document.getElementById('brushSize').addEventListener('input', (e) => {
            this.currentLineWidth = e.target.value;
            document.getElementById('brushSizeValue').textContent = `${e.target.value}px`;
        });
        
        // Botón limpiar
        document.getElementById('clearBtn').addEventListener('click', () => {
            if (confirm('¿Estás seguro de que quieres limpiar toda la pizarra?')) {
                this.socket.emit('clear-canvas');
            }
        });
        
        // Chat
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        // Redimensionar canvas cuando cambia el tamaño de la ventana
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    setupSocketEvents() {
        // Eventos de dibujo
        this.socket.on('draw', (data) => {
            this.drawOnCanvas(data);
        });
        
        this.socket.on('canvas-state', (state) => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            state.forEach(data => this.drawOnCanvas(data));
        });
        
        this.socket.on('clear-canvas', (data) => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.addSystemMessage(`${data.username} limpió la pizarra`, data.timestamp);
        });
        
        // Eventos de chat
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
        
        // Manejo de reconexión
        this.socket.on('connect', () => {
            console.log('Conectado al servidor');
            if (this.username) {
                this.socket.emit('set-username', this.username);
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('Desconectado del servidor');
        });
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth - 4; // Restar bordes
        this.canvas.height = container.clientHeight - 100; // Restar espacio de herramientas
        
        // Redibujar estado actual si existe
        if (this.socket.connected) {
            this.socket.emit('request-canvas-state');
        }
    }
    
    // Métodos de dibujo
    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        [this.lastX, this.lastY] = [pos.x, pos.y];
        
        // Emitir inicio del trazo
        this.socket.emit('draw', {
            x: this.lastX,
            y: this.lastY,
            type: 'start',
            color: this.currentColor,
            lineWidth: this.currentLineWidth
        });
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        e.preventDefault();
        const pos = this.getMousePos(e);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentLineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        
        // Emitir punto de dibujo
        this.socket.emit('draw', {
            x: pos.x,
            y: pos.y,
            type: 'draw',
            color: this.currentColor,
            lineWidth: this.currentLineWidth
        });
        
        [this.lastX, this.lastY] = [pos.x, pos.y];
    }
    
    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            
            // Emitir fin del trazo
            this.socket.emit('draw', {
                x: this.lastX,
                y: this.lastY,
                type: 'end',
                color: this.currentColor,
                lineWidth: this.currentLineWidth
            });
        }
    }
    
    drawOnCanvas(data) {
        if (data.type === 'start') {
            this.ctx.beginPath();
            this.ctx.moveTo(data.x, data.y);
        } else if (data.type === 'draw') {
            this.ctx.lineTo(data.x, data.y);
            this.ctx.strokeStyle = data.userColor || data.color;
            this.ctx.lineWidth = data.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(data.x, data.y);
        }
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
    
    // Métodos de chat
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

// Inicializar la aplicación cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    new CollaborativeWhiteboard();
});
