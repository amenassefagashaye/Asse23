class RTCClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.connecting = false;
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        this.setupDefaultHandlers();
    }
    
    async connect(roomCode) {
        if (this.connected || this.connecting) {
            return;
        }
        
        this.connecting = true;
        
        try {
            // In production, use your server's WebSocket URL
            const wsUrl = `ws://localhost:8000/ws/${roomCode}`;
            this.ws = new WebSocket(wsUrl);
            
            await this.setupWebSocket();
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.handleConnectionError();
        }
    }
    
    setupWebSocket() {
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                reject(new Error('WebSocket not initialized'));
                return;
            }
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
                this.connecting = false;
                this.reconnectAttempts = 0;
                this.emit('connected');
                resolve();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };
            
            this.ws.onclose = (event) => {
                console.log('WebSocket disconnected:', event.code, event.reason);
                this.connected = false;
                this.connecting = false;
                this.emit('disconnected');
                this.handleReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('error', error);
                reject(error);
            };
            
            // Set timeout for connection
            setTimeout(() => {
                if (!this.connected && this.connecting) {
                    reject(new Error('Connection timeout'));
                    this.handleConnectionError();
                }
            }, 10000);
        });
    }
    
    handleMessage(data) {
        console.log('Received message:', data);
        
        // Call specific handler for message type
        if (data.type && this.messageHandlers.has(data.type)) {
            this.messageHandlers.get(data.type)(data);
        }
        
        // Also emit generic event
        this.emit('message', data);
        
        // Emit event based on type
        if (data.type) {
            this.emit(data.type, data);
        }
    }
    
    send(message) {
        if (!this.connected || !this.ws) {
            console.warn('Cannot send message: WebSocket not connected');
            return false;
        }
        
        try {
            const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
            this.ws.send(messageStr);
            return true;
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }
    
    on(event, handler) {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, handler);
        }
    }
    
    off(event) {
        this.messageHandlers.delete(event);
    }
    
    emit(event, data = null) {
        if (this.messageHandlers.has(event)) {
            this.messageHandlers.get(event)(data);
        }
    }
    
    setupDefaultHandlers() {
        // Default handlers for common events
        this.on('ping', () => {
            this.send({ type: 'pong' });
        });
        
        this.on('playerJoined', (data) => {
            console.log('Player joined:', data.playerName);
        });
        
        this.on('playerLeft', (data) => {
            console.log('Player left:', data.playerName);
        });
        
        this.on('error', (error) => {
            console.error('Server error:', error);
        });
    }
    
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.connected) {
                this.connect(this.currentRoomCode).catch(() => {
                    this.handleReconnect();
                });
            }
        }, delay);
    }
    
    handleConnectionError() {
        this.connecting = false;
        this.emit('connectionError');
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'Client disconnected');
            this.ws = null;
        }
        this.connected = false;
        this.connecting = false;
    }
    
    isConnected() {
        return this.connected;
    }
    
    isConnecting() {
        return this.connecting;
    }
}