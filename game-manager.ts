import { v4 } from "@std/uuid";

export interface Player {
  id: string;
  name: string;
  socket: WebSocket;
  isReady: boolean;
  score: number;
  board: number[];
  markedNumbers: Set<number>;
  joinedAt: number;
}

export interface Room {
  code: string;
  name: string;
  hostId: string;
  hostName: string;
  gameType: string;
  stake: number;
  maxPlayers: number;
  players: Map<string, Player>;
  gameStarted: boolean;
  createdAt: number;
  settings: {
    autoCallNumbers: boolean;
    callInterval: number;
    winPatterns: string[];
  };
}

export class GameManager {
  private onlinePlayers: Map<string, Player> = new Map();
  private totalPlayers: number = 0;
  private activeGames: number = 0;
  private totalRoomsCreated: number = 0;

  getOnlinePlayers() {
    return Array.from(this.onlinePlayers.values()).map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      joinedAt: p.joinedAt
    }));
  }

  getTotalPlayers() {
    return this.totalPlayers;
  }

  getActiveGames() {
    return this.activeGames;
  }

  getTotalRoomsCreated() {
    return this.totalRoomsCreated;
  }

  incrementRoomsCount() {
    this.totalRoomsCreated++;
  }

  addPlayer(player: Player) {
    this.onlinePlayers.set(player.id, player);
    this.totalPlayers++;
  }

  removePlayer(playerId: string) {
    this.onlinePlayers.delete(playerId);
  }

  generateBoard(gameType: string): number[] {
    switch(gameType) {
      case '75ball':
        return this.generate75BallBoard();
      case '90ball':
        return this.generate90BallBoard();
      case '30ball':
        return this.generate30BallBoard();
      case 'pattern':
        return this.generatePatternBoard();
      default:
        return this.generate75BallBoard();
    }
  }

  private generate75BallBoard(): number[] {
    const board: number[] = [];
    const columns = [
      [1, 15], [16, 30], [31, 45], [46, 60], [61, 75]
    ];
    
    for (let col = 0; col < 5; col++) {
      const [min, max] = columns[col];
      const numbers = new Set<number>();
      
      while (numbers.size < 5) {
        numbers.add(Math.floor(Math.random() * (max - min + 1)) + min);
      }
      
      const colNumbers = Array.from(numbers).sort((a, b) => a - b);
      board.push(...colNumbers);
    }
    
    return board;
  }

  private generate90BallBoard(): number[] {
    const board: number[] = [];
    const columns = [
      [1, 10], [11, 20], [21, 30], [31, 40], [41, 50],
      [51, 60], [61, 70], [71, 80], [81, 90]
    ];
    
    for (let col = 0; col < 9; col++) {
      const [min, max] = columns[col];
      const numbers = new Set<number>();
      const count = Math.floor(Math.random() * 3) + 1; // 1-3 numbers per column
      
      while (numbers.size < count) {
        numbers.add(Math.floor(Math.random() * (max - min + 1)) + min);
      }
      
      board.push(...Array.from(numbers));
    }
    
    return board;
  }

  private generate30BallBoard(): number[] {
    const numbers = new Set<number>();
    
    while (numbers.size < 9) {
      numbers.add(Math.floor(Math.random() * 30) + 1);
    }
    
    return Array.from(numbers).sort((a, b) => a - b);
  }

  private generatePatternBoard(): number[] {
    return this.generate75BallBoard();
  }

  generateRandomNumber(gameType: string): { number: number; display: string } {
    let maxNumber: number;
    
    switch(gameType) {
      case '75ball':
      case 'pattern':
        maxNumber = 75;
        break;
      case '90ball':
        maxNumber = 90;
        break;
      case '30ball':
        maxNumber = 30;
        break;
      default:
        maxNumber = 75;
    }
    
    const number = Math.floor(Math.random() * maxNumber) + 1;
    let display = number.toString();
    
    // Format for BINGO boards
    if (gameType === '75ball' || gameType === 'pattern') {
      const letters = 'BINGO';
      const column = Math.floor((number - 1) / 15);
      const letter = letters[Math.min(column, 4)];
      display = `${letter}-${number}`;
    }
    
    return { number, display };
  }

  verifyWin(playerId: string, pattern: string, roomCode: string): { valid: boolean; amount: number } {
    // Basic win verification
    // In a real implementation, you'd check the player's board against called numbers
    const patterns = ['row', 'column', 'diagonal', 'four-corners', 'full-house', 
                     'one-line', 'two-lines', 'x-pattern', 'frame'];
    
    if (patterns.includes(pattern)) {
      const amount = this.calculatePrize(100, 10); // Example calculation
      return { valid: true, amount };
    }
    
    return { valid: false, amount: 0 };
  }

  private calculatePrize(stake: number, playerCount: number): number {
    const pot = stake * playerCount;
    return Math.floor(pot * 0.8); // 80% to winner
  }

  startGame(roomCode: string): { success: boolean; board?: number[]; error?: string } {
    try {
      // Generate a sample board
      const board = this.generate75BallBoard();
      this.activeGames++;
      
      return {
        success: true,
        board
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
