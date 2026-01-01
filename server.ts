import { serve } from "@std/http";
import { v4 } from "@std/uuid";
import { acceptable, acceptWebSocket } from "@std/websocket";

// Game imports
import { GameManager } from "./game-manager.ts";
import { RoomManager } from "./room-manager.ts";

const gameManager = new GameManager();
const roomManager = new RoomManager(gameManager);

// Helper to get content type
function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    "html": "text/html; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "js": "application/javascript; charset=utf-8",
    "json": "application/json; charset=utf-8",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "svg": "image/svg+xml",
    "ico": "image/x-icon",
    "woff": "font/woff",
    "woff2": "font/woff2",
    "ttf": "font/ttf",
    "eot": "application/vnd.ms-fontobject"
  };
  return types[ext || ""] || "text/plain; charset=utf-8";
}

// Serve static files from public folder
async function serveStatic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Default to index.html for root path
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  
  // Remove leading slash for Deno.readFile
  if (filePath.startsWith("/")) {
    filePath = filePath.substring(1);
  }
  
  // Default to public folder
  const fullPath = `./public/${filePath}`;
  
  try {
    const file = await Deno.readFile(fullPath);
    const contentType = getContentType(filePath);
    
    return new Response(file, {
      headers: { 
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("File not found", { 
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
    console.error("Error serving static file:", error);
    return new Response("Internal server error", { 
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

// Add CORS headers to response
function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// API Routes
async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  
  try {
    // Players endpoint
    if (path === "/api/players" && req.method === "GET") {
      const players = gameManager.getOnlinePlayers();
      return Response.json({
        success: true,
        players,
        count: players.length
      });
    }
    
    // Create room
    if (path === "/api/rooms/create" && req.method === "POST") {
      const body = await req.json();
      const result = await roomManager.createRoom(body);
      return Response.json(result);
    }
    
    // Join room
    if (path === "/api/rooms/join" && req.method === "POST") {
      const body = await req.json();
      const result = await roomManager.joinRoom(body);
      return Response.json(result);
    }
    
    // Start game
    if (path === "/api/game/start" && req.method === "POST") {
      const body = await req.json();
      const result = gameManager.startGame(body.roomCode);
      return Response.json(result);
    }
    
    // Get available rooms
    if (path === "/api/rooms" && req.method === "GET") {
      const rooms = roomManager.getAvailableRooms();
      return Response.json({
        success: true,
        rooms,
        count: rooms.length
      });
    }
    
    // Get room info
    if (path.startsWith("/api/rooms/") && req.method === "GET") {
      const roomCode = path.split("/").pop();
      if (roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (room) {
          return Response.json({
            success: true,
            room: {
              code: room.code,
              name: room.name,
              hostName: room.hostName,
              players: room.players.size,
              maxPlayers: room.maxPlayers,
              gameType: room.gameType,
              stake: room.stake,
              gameStarted: room.gameStarted
            }
          });
        }
      }
      return Response.json({ 
        success: false, 
        error: "Room not found" 
      }, { status: 404 });
    }
    
    // Health check endpoint
    if (path === "/api/health" && req.method === "GET") {
      return Response.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        rooms: roomManager.getAvailableRooms().length,
        players: gameManager.getOnlinePlayers().length,
        uptime: process.uptime()
      });
    }
    
    // Stats endpoint
    if (path === "/api/stats" && req.method === "GET") {
      return Response.json({
        success: true,
        stats: {
          totalRoomsCreated: roomManager.getTotalRoomsCreated(),
          totalPlayers: gameManager.getTotalPlayers(),
          activeGames: gameManager.getActiveGames()
        }
      });
    }
    
    return new Response("Not found", { 
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
    
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ 
      success: false, 
      error: "Internal server error",
      message: error.message 
    }, { 
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}

// WebSocket handler
async function handleWebSocket(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
  if (path.startsWith("/ws/") && acceptable(req)) {
    const roomCode = path.split("/")[2]; // Get room code from /ws/roomCode
    
    if (roomCode) {
      const { socket, response } = acceptWebSocket({
        conn: req.conn,
        bufReader: req.r,
        bufWriter: req.w,
        headers: req.headers,
      });
      
      // Handle WebSocket connection in background
      handleWsConnection(socket, roomCode);
      
      return response;
    }
  }
  
  return new Response("Invalid WebSocket request", { 
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

async function handleWsConnection(socket: WebSocket, roomCode: string) {
  console.log(`New WebSocket connection for room: ${roomCode}`);
  
  let playerId: string | null = null;
  let playerName: string = "Anonymous";
  
  try {
    for await (const event of socket) {
      if (typeof event === "string") {
        try {
          const data = JSON.parse(event);
          console.log(`Received WebSocket message: ${data.type}`);
          
          switch (data.type) {
            case "join":
              playerId = data.playerId || v4.generate();
              playerName = data.playerName || `Player ${playerId.substring(0, 8)}`;
              
              // Add player to room
              roomManager.addPlayerToRoom(roomCode, playerId, socket, playerName);
              
              // Get room info
              const room = roomManager.getRoom(roomCode);
              if (room) {
                // Send welcome message to player
                socket.send(JSON.stringify({
                  type: "welcome",
                  playerId,
                  room: {
                    code: room.code,
                    name: room.name,
                    hostId: room.hostId,
                    gameType: room.gameType,
                    stake: room.stake,
                    maxPlayers: room.maxPlayers
                  }
                }));
                
                // Broadcast to other players
                broadcastToRoom(roomCode, {
                  type: "playerJoined",
                  playerId,
                  playerName,
                  timestamp: Date.now(),
                  totalPlayers: room.players.size
                }, playerId);
              }
              break;
              
            case "leave":
              if (data.playerId) {
                roomManager.removePlayerFromRoom(roomCode, data.playerId);
                broadcastToRoom(roomCode, {
                  type: "playerLeft",
                  playerId: data.playerId,
                  playerName: data.playerName,
                  timestamp: Date.now()
                });
              }
              break;
              
            case "chat":
              broadcastToRoom(roomCode, {
                type: "chat",
                playerId: data.playerId,
                playerName: data.playerName,
                message: data.message,
                timestamp: Date.now()
              }, data.playerId);
              break;
              
            case "startGame":
              const roomInfo = roomManager.getRoom(roomCode);
              if (roomInfo && roomInfo.hostId === data.playerId && !roomInfo.gameStarted) {
                roomInfo.gameStarted = true;
                
                // Generate game board for all players
                const board = gameManager.generateBoard(roomInfo.gameType);
                
                broadcastToRoom(roomCode, {
                  type: "gameStarted",
                  gameType: roomInfo.gameType,
                  board,
                  timestamp: Date.now()
                });
              }
              break;
              
            case "callNumber":
              const currentRoom = roomManager.getRoom(roomCode);
              if (currentRoom && currentRoom.hostId === data.playerId && currentRoom.gameStarted) {
                const number = gameManager.generateRandomNumber(currentRoom.gameType);
                
                broadcastToRoom(roomCode, {
                  type: "numberCalled",
                  number: number.number,
                  display: number.display,
                  caller: data.playerName,
                  timestamp: Date.now()
                });
              }
              break;
              
            case "markNumber":
              broadcastToRoom(roomCode, {
                type: "playerMarked",
                playerId: data.playerId,
                playerName: data.playerName,
                number: data.number,
                timestamp: Date.now()
              }, data.playerId);
              break;
              
            case "claimWin":
              // Verify the win first
              const winResult = gameManager.verifyWin(
                data.playerId, 
                data.pattern, 
                roomCode
              );
              
              if (winResult.valid) {
                broadcastToRoom(roomCode, {
                  type: "winner",
                  playerId: data.playerId,
                  playerName: data.playerName,
                  pattern: data.pattern,
                  amount: winResult.amount,
                  timestamp: Date.now()
                });
                
                // End the game
                const roomToEnd = roomManager.getRoom(roomCode);
                if (roomToEnd) {
                  roomToEnd.gameStarted = false;
                }
              }
              break;
              
            case "ping":
              socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
              break;
              
            case "playerReady":
              broadcastToRoom(roomCode, {
                type: "playerReady",
                playerId: data.playerId,
                playerName: data.playerName,
                ready: data.ready,
                timestamp: Date.now()
              }, data.playerId);
              break;
              
            case "updateSettings":
              const roomForSettings = roomManager.getRoom(roomCode);
              if (roomForSettings && roomForSettings.hostId === data.playerId) {
                roomForSettings.settings = {
                  ...roomForSettings.settings,
                  ...data.settings
                };
                
                broadcastToRoom(roomCode, {
                  type: "settingsUpdated",
                  settings: roomForSettings.settings,
                  updatedBy: data.playerName,
                  timestamp: Date.now()
                });
              }
              break;
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error);
          socket.send(JSON.stringify({
            type: "error",
            message: "Invalid message format"
          }));
        }
      }
    }
  } catch (error) {
    console.error("WebSocket error:", error);
  } finally {
    // Clean up on disconnect
    if (playerId) {
      roomManager.removePlayerFromRoom(roomCode, playerId);
      broadcastToRoom(roomCode, {
        type: "playerLeft",
        playerId: playerId,
        playerName: playerName,
        timestamp: Date.now(),
        reason: "disconnected"
      });
    }
  }
}

function broadcastToRoom(roomCode: string, message: any, excludePlayerId?: string) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;
  
  const messageStr = JSON.stringify(message);
  
  for (const [playerId, player] of room.players) {
    if (playerId !== excludePlayerId && player.socket.readyState === WebSocket.OPEN) {
      try {
        player.socket.send(messageStr);
      } catch (error) {
        console.error(`Error sending to player ${playerId}:`, error);
      }
    }
  }
}

// Main request handler
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Add CORS headers to all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
  
  // Handle WebSocket
  if (url.pathname.startsWith("/ws/")) {
    return handleWebSocket(req);
  }
  
  // Handle API
  if (url.pathname.startsWith("/api/")) {
    const response = await handleApi(req);
    
    // Add CORS headers to API responses
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  
  // Serve static files
  const response = await serveStatic(req);
  
  // Add cache headers for static files
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=3600");
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Start server
const PORT = Deno.env.get("PORT") || "8000";
const HOST = Deno.env.get("HOST") || "0.0.0.0";

console.log(`Starting server on http://${HOST}:${PORT}`);
console.log(`Serving static files from ./public`);
console.log(`WebSocket endpoint: ws://${HOST}:${PORT}/ws/{roomCode}`);
console.log(`API endpoint: http://${HOST}:${PORT}/api/*`);
console.log(`Health check: http://${HOST}:${PORT}/api/health`);

// Create public directory if it doesn't exist
try {
  await Deno.mkdir("./public", { recursive: true });
  console.log("Created public directory");
} catch (error) {
  // Directory already exists
}

// Create a basic index.html if it doesn't exist
try {
  await Deno.stat("./public/index.html");
} catch {
  const basicHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>አሰፋ ዲጂታል ቢንጎ - RTC ጨዋታ</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #0d47a1 0%, #1a237e 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .container {
            background: rgba(0,0,0,0.7);
            padding: 40px;
            border-radius: 15px;
            border: 3px solid #ffd700;
        }
        h1 {
            color: #ffd700;
            margin-bottom: 20px;
        }
        .status {
            background: rgba(255,215,0,0.2);
            padding: 10px;
            border-radius: 8px;
            margin: 20px 0;
        }
        a {
            color: #28a745;
            text-decoration: none;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>አሰፋ ዲጂታል ቢንጎ</h1>
        <h2>RTC ባለብዙ ተጫዋች ጨዋታ</h2>
        
        <div class="status">
            ✅ Server is running successfully!
        </div>
        
        <p>Place your game files in the <code>public/</code> folder.</p>
        <p>API is available at: <a href="/api/health">/api/health</a></p>
        <p>WebSocket endpoint: <code>ws://${HOST}:${PORT}/ws/{roomCode}</code></p>
        
        <p style="margin-top: 30px; color: #ffd700;">
            Developed by: አሰፋ ጋሻዬ ብርሃንነህ
        </p>
    </div>
</body>
</html>`;
  
  await Deno.writeTextFile("./public/index.html", basicHtml);
  console.log("Created default index.html");
}

// Start the server
serve(handler, { 
  port: parseInt(PORT),
  hostname: HOST,
  onListen: ({ port, hostname }) => {
    console.log(`✅ Server is listening on http://${hostname}:${port}`);
    console.log(`📁 Static files: http://${hostname}:${port}/index.html`);
    console.log(`🔌 WebSocket: ws://${hostname}:${port}/ws/{roomCode}`);
    console.log(`🩺 Health: http://${hostname}:${port}/api/health`);
  }
});
