class BingoGame {
    constructor() {
        this.gameState = {
            type: null,
            board: [],
            markedNumbers: new Set(),
            calledNumbers: [],
            currentNumber: null,
            isHost: false,
            roomCode: null,
            players: [],
            playerId: null,
            gameStarted: false,
            winPatterns: {
                '75ball': ['row', 'column', 'diagonal', 'four-corners', 'full-house'],
                '90ball': ['one-line', 'two-lines', 'full-house'],
                '30ball': ['full-house'],
                'pattern': ['x-pattern', 'frame', 'postage-stamp', 'small-diamond']
            },
            patterns: {
                'row': 'ረድፍ',
                'column': 'አምድ',
                'diagonal': 'ዲያግናል',
                'four-corners': 'አራት ማእዘኖች',
                'full-house': 'ሙሉ ቤት',
                'one-line': 'አንድ ረድፍ',
                'two-lines': 'ሁለት ረድፍ',
                'x-pattern': 'X ንድፍ',
                'frame': 'አውራ ቀለበት',
                'postage-stamp': 'ማህተም',
                'small-diamond': 'ዲያምንድ'
            }
        };
        
        this.rtcClient = null;
        this.initialize();
    }
    
    initialize() {
        this.setupEventListeners();
        this.loadOnlinePlayers();
    }
    
    setupEventListeners() {
        // Page navigation
        window.showPage = this.showPage.bind(this);
        
        // Game controls
        document.getElementById('createRoomBtn')?.addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn')?.addEventListener('click', () => this.joinRoom());
        document.getElementById('startGameBtn')?.addEventListener('click', () => this.startGame());
        document.getElementById('callNumberBtn')?.addEventListener('click', () => this.callNumber());
        
        // Chat
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendChatMessage();
            });
        }
        
        const inGameChatInput = document.getElementById('inGameChatInput');
        if (inGameChatInput) {
            inGameChatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendInGameChat();
            });
        }
    }
    
    showPage(pageNum) {
        // Hide all pages
        document.querySelectorAll('.page-container').forEach(page => {
            page.classList.remove('active');
        });
        
        // Show selected page
        const page = document.getElementById(`page${pageNum}`);
        if (page) {
            page.classList.add('active');
        }
        
        // Update connection status
        this.updateConnectionStatus();
    }
    
    async loadOnlinePlayers() {
        try {
            const response = await fetch('http://localhost:8000/api/players');
            const players = await response.json();
            this.updateOnlinePlayersDisplay(players);
        } catch (error) {
            console.error('Failed to load online players:', error);
        }
    }
    
    updateOnlinePlayersDisplay(players) {
        const container = document.getElementById('onlinePlayers');
        if (!container) return;
        
        container.innerHTML = '';
        
        players.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <div class="player-avatar">${player.name.charAt(0)}</div>
                <div class="player-name">${player.name}</div>
            `;
            container.appendChild(card);
        });
    }
    
    async createRoom() {
        const hostName = document.getElementById('hostName').value;
        const roomName = document.getElementById('roomName').value;
        const maxPlayers = document.getElementById('maxPlayers').value;
        const gameType = document.getElementById('gameType').value;
        const stake = document.getElementById('stakeAmount').value;
        
        if (!hostName || !roomName) {
            this.showToast('እባክዎ ሁሉንም መረጃዎች ያስገቡ', 'error');
            return;
        }
        
        try {
            // Initialize WebSocket connection
            this.rtcClient = new RTCClient();
            
            const response = await fetch('http://localhost:8000/api/rooms/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostName,
                    roomName,
                    maxPlayers: parseInt(maxPlayers),
                    gameType,
                    stake: parseInt(stake)
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.gameState.isHost = true;
                this.gameState.roomCode = data.roomCode;
                this.gameState.playerId = data.playerId;
                
                // Connect to WebSocket room
                await this.rtcClient.connect(data.roomCode);
                
                // Update display
                document.getElementById('roomNameDisplay').textContent = roomName;
                document.getElementById('roomCodeDisplay').textContent = data.roomCode;
                document.getElementById('hostDisplay').textContent = hostName;
                document.getElementById('maxPlayersDisplay').textContent = maxPlayers;
                document.getElementById('gameTypeDisplay').textContent = this.getGameTypeName(gameType);
                document.getElementById('stakeDisplay').textContent = `${stake} ብር`;
                document.getElementById('prizeDisplay').textContent = this.calculatePrize(stake, maxPlayers);
                
                // Add host to players list
                this.gameState.players = [{
                    id: data.playerId,
                    name: hostName,
                    isHost: true,
                    isReady: true,
                    score: 0
                }];
                
                this.updatePlayersList();
                this.showPage(8);
                
                this.showToast('ክፍሉ በተሳካ ሁኔታ ተፈጥሯል!', 'success');
            } else {
                this.showToast(data.message || 'ስህተት ተከስቷል', 'error');
            }
        } catch (error) {
            console.error('Error creating room:', error);
            this.showToast('ክፍል መፍጠር አልተሳካም', 'error');
        }
    }
    
    async joinRoom() {
        const playerName = document.getElementById('joinName').value;
        const roomCode = document.getElementById('roomCode').value;
        
        if (!playerName || !roomCode) {
            this.showToast('እባክዎ ስምዎን እና የክፍሉን ኮድ ያስገቡ', 'error');
            return;
        }
        
        try {
            // Initialize WebSocket connection
            this.rtcClient = new RTCClient();
            
            const response = await fetch('http://localhost:8000/api/rooms/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomCode,
                    playerName
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.gameState.isHost = false;
                this.gameState.roomCode = roomCode;
                this.gameState.playerId = data.playerId;
                this.gameState.type = data.gameType;
                
                // Connect to WebSocket room
                await this.rtcClient.connect(roomCode);
                
                // Update display with room info
                document.getElementById('roomNameDisplay').textContent = data.roomName;
                document.getElementById('roomCodeDisplay').textContent = roomCode;
                document.getElementById('hostDisplay').textContent = data.hostName;
                document.getElementById('maxPlayersDisplay').textContent = data.maxPlayers;
                document.getElementById('gameTypeDisplay').textContent = this.getGameTypeName(data.gameType);
                document.getElementById('stakeDisplay').textContent = `${data.stake} ብር`;
                document.getElementById('prizeDisplay').textContent = this.calculatePrize(data.stake, data.maxPlayers);
                
                // Set up WebSocket handlers
                this.setupWebSocketHandlers();
                
                // Join the room via WebSocket
                this.rtcClient.send({
                    type: 'join',
                    playerId: this.gameState.playerId,
                    playerName: playerName
                });
                
                this.showPage(8);
                this.showToast(`በ${data.roomName} ክፍል ላይ ተቀላቀሉ!`, 'success');
            } else {
                this.showToast(data.message || 'ስህተት ተከስቷል', 'error');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            this.showToast('በክፍሉ ላይ መቀላቀል አልተሳካም', 'error');
        }
    }
    
    setupWebSocketHandlers() {
        if (!this.rtcClient) return;
        
        this.rtcClient.on('playerJoined', (data) => {
            this.gameState.players.push({
                id: data.playerId,
                name: data.playerName,
                isHost: data.isHost,
                isReady: false,
                score: 0
            });
            this.updatePlayersList();
            this.addChatMessage('system', `${data.playerName} ተቀላቀለ!`);
        });
        
        this.rtcClient.on('playerLeft', (data) => {
            this.gameState.players = this.gameState.players.filter(p => p.id !== data.playerId);
            this.updatePlayersList();
            this.addChatMessage('system', `${data.playerName} ሄደ!`);
        });
        
        this.rtcClient.on('gameStarted', (data) => {
            this.gameState.gameStarted = true;
            this.gameState.type = data.gameType;
            this.startMultiplayerGame(data.board);
        });
        
        this.rtcClient.on('numberCalled', (data) => {
            this.updateCalledNumber(data.number, data.caller);
        });
        
        this.rtcClient.on('playerMarked', (data) => {
            // Update other player's marks visually
            if (data.playerId !== this.gameState.playerId) {
                this.markNumberOnBoard(data.number, data.playerId);
            }
        });
        
        this.rtcClient.on('winner', (data) => {
            this.showWinner(data.winnerName, data.pattern, data.amount);
        });
        
        this.rtcClient.on('chat', (data) => {
            this.addChatMessage('player', `${data.playerName}: ${data.message}`);
        });
    }
    
    async startGame() {
        if (!this.gameState.isHost) {
            this.showToast('አስተናጋጁ ብቻ ጨዋታውን ሊጀምር ይችላል', 'warning');
            return;
        }
        
        try {
            const response = await fetch('http://localhost:8000/api/game/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomCode: this.gameState.roomCode
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Notify all players via WebSocket
                this.rtcClient.send({
                    type: 'startGame',
                    gameType: this.gameState.type,
                    board: data.board
                });
                
                this.startMultiplayerGame(data.board);
                this.showToast('ጨዋታው ጀመረ!', 'success');
            }
        } catch (error) {
            console.error('Error starting game:', error);
            this.showToast('ጨዋታውን መጀመር አልተሳካም', 'error');
        }
    }
    
    startMultiplayerGame(boardData) {
        this.gameState.gameStarted = true;
        this.showPage(9);
        
        // Update room info
        document.getElementById('multiplayerRoomName').textContent = 
            document.getElementById('roomNameDisplay').textContent;
        document.getElementById('gamePlayerCount').textContent = 
            `(${this.gameState.players.length} ተጫዋቾች)`;
        
        // Generate game board
        this.generateMultiplayerBoard(boardData);
        
        // Update game controls
        if (this.gameState.isHost) {
            document.getElementById('callNumberBtn').disabled = false;
        } else {
            document.getElementById('callNumberBtn').disabled = true;
        }
    }
    
    generateMultiplayerBoard(boardData) {
        const container = document.getElementById('multiplayerBoard');
        container.innerHTML = '';
        
        // Generate board based on game type
        // This would be similar to your existing board generation logic
        // but adapted for multiplayer
        const board = this.createBoard(boardData);
        container.appendChild(board);
    }
    
    callNumber() {
        if (!this.gameState.isHost || !this.gameState.gameStarted) {
            return;
        }
        
        // Generate random number based on game type
        const number = this.generateRandomNumber();
        this.gameState.calledNumbers.push(number);
        this.gameState.currentNumber = number;
        
        // Update display
        document.getElementById('multiplayerCurrentNumber').textContent = 
            this.formatNumber(number);
        document.getElementById('currentCaller').textContent = 
            this.gameState.players.find(p => p.isHost)?.name || 'አስተናጋጁ';
        
        // Add to called numbers list
        this.addCalledNumber(number);
        
        // Broadcast to all players
        this.rtcClient.send({
            type: 'callNumber',
            number: number,
            caller: this.gameState.players.find(p => p.isHost)?.name
        });
        
        // Play sound
        this.playCallSound();
    }
    
    markNumber(number) {
        if (!this.gameState.gameStarted) return;
        
        // Mark on board
        this.gameState.markedNumbers.add(number);
        
        // Send to other players
        this.rtcClient.send({
            type: 'markNumber',
            number: number,
            playerId: this.gameState.playerId
        });
        
        // Check for win
        this.checkForWin();
    }
    
    checkForWin() {
        const winPattern = this.checkWinPatterns();
        if (winPattern) {
            // Claim win
            this.rtcClient.send({
                type: 'claimWin',
                playerId: this.gameState.playerId,
                pattern: winPattern
            });
        }
    }
    
    showWinner(winnerName, pattern, amount) {
        document.getElementById('winnerNameDisplay').textContent = winnerName;
        document.getElementById('winningPatternDisplay').textContent = 
            this.gameState.patterns[pattern] || pattern;
        document.getElementById('winnerAmountDisplay').textContent = 
            `${amount.toLocaleString()} ብር`;
        
        document.getElementById('winnerModal').style.display = 'block';
        
        // Play win sound
        this.playWinSound();
    }
    
    updatePlayersList() {
        const container = document.getElementById('playersList');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.gameState.players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = `player-in-room ${player.isHost ? 'player-host' : ''} 
                ${player.id === this.gameState.playerId ? 'player-you' : ''}`;
            
            playerElement.innerHTML = `
                <div class="player-status ${player.isReady ? 'ready' : ''}"></div>
                <div class="player-avatar-small">${player.name.charAt(0)}</div>
                <div class="player-details">
                    <div class="player-name">${player.name}</div>
                    <div class="player-score">ውጤት: ${player.score}</div>
                </div>
            `;
            
            container.appendChild(playerElement);
        });
        
        // Update player count
        document.getElementById('playerCount').textContent = this.gameState.players.length;
    }
    
    updateCalledNumbersDisplay() {
        const container = document.getElementById('multiplayerCalledNumbers');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.gameState.calledNumbers.slice(-10).forEach(number => {
            const span = document.createElement('span');
            span.className = 'called-number';
            span.textContent = this.formatNumber(number);
            container.appendChild(span);
        });
    }
    
    addCalledNumber(number) {
        this.gameState.calledNumbers.push(number);
        this.updateCalledNumbersDisplay();
    }
    
    addChatMessage(type, message) {
        const container = document.getElementById('chatMessages') || 
                         document.getElementById('inGameMessages');
        if (!container) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${type}`;
        messageElement.textContent = message;
        
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }
    
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && this.rtcClient) {
            this.rtcClient.send({
                type: 'chat',
                message: message,
                playerId: this.gameState.playerId,
                playerName: this.gameState.players.find(p => p.id === this.gameState.playerId)?.name
            });
            
            input.value = '';
        }
    }
    
    sendInGameChat() {
        const input = document.getElementById('inGameChatInput');
        const message = input.value.trim();
        
        if (message && this.rtcClient) {
            this.rtcClient.send({
                type: 'chat',
                message: message,
                playerId: this.gameState.playerId,
                playerName: this.gameState.players.find(p => p.id === this.gameState.playerId)?.name
            });
            
            this.addChatMessage('player', `እርስዎ: ${message}`);
            input.value = '';
        }
    }
    
    toggleChat() {
        const chat = document.getElementById('inGameChat');
        chat.classList.toggle('open');
    }
    
    leaveRoom() {
        if (this.rtcClient) {
            this.rtcClient.send({
                type: 'leave',
                playerId: this.gameState.playerId
            });
            this.rtcClient.disconnect();
        }
        
        // Reset game state
        this.gameState = {
            type: null,
            board: [],
            markedNumbers: new Set(),
            calledNumbers: [],
            currentNumber: null,
            isHost: false,
            roomCode: null,
            players: [],
            playerId: null,
            gameStarted: false
        };
        
        this.showPage(0);
        this.showToast('ከክፍሉ ተለቀቁ', 'info');
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    updateConnectionStatus() {
        const dot = document.getElementById('connectionDot');
        const status = document.getElementById('connectionStatus');
        
        if (this.rtcClient && this.rtcClient.isConnected()) {
            dot.className = 'status-dot connected';
            status.textContent = 'ተገናኝቷል';
        } else if (this.rtcClient && this.rtcClient.isConnecting()) {
            dot.className = 'status-dot connecting';
            status.textContent = 'በመገናኘት ላይ...';
        } else {
            dot.className = 'status-dot';
            status.textContent = 'ምንም ግንኙነት የለም';
        }
    }
    
    // Utility methods
    getGameTypeName(type) {
        const names = {
            '75ball': '75-ቢንጎ',
            '90ball': '90-ቢንጎ',
            '30ball': '30-ቢንጎ',
            'pattern': 'ንድፍ ቢንጎ'
        };
        return names[type] || type;
    }
    
    calculatePrize(stake, players) {
        const pot = stake * players;
        const prize = Math.floor(pot * 0.8); // 80% to winner, 20% to platform
        return `${prize.toLocaleString()} ብር`;
    }
    
    formatNumber(number) {
        if (this.gameState.type === '75ball' || this.gameState.type === 'pattern') {
            const letters = 'BINGO';
            const column = Math.floor((number - 1) / 15);
            const letter = letters[Math.min(column, 4)];
            return `${letter}-${number}`;
        }
        return number.toString();
    }
    
    playCallSound() {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-bell-notification-933.mp3');
        audio.play().catch(() => {});
    }
    
    playWinSound() {
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
        audio.play().catch(() => {});
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.game = new BingoGame();
});