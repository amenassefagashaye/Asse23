// Import from Deno standard library
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { v4 } from "https://deno.land/std@0.203.0/uuid/mod.ts";
import {
  acceptable,
  acceptWebSocket,
  WebSocket,
} from "https://deno.land/std@0.203.0/ws/mod.ts";

// Import your game logic
import { GameManager } from "./game-manager.ts";
import { RoomManager } from "./room-manager.ts";

const gameManager = new GameManager();
const roomManager = new RoomManager(gameManager);

// Map file extensions to Content-Type
function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
  };
  return types[ext ?? ""] || "application/octet-stream";
}

// Serve static files from /public
async function serveStatic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;

  try {
    const file = await Deno.readFile(`./public${filePath}`);
    const contentType = getContentType(filePath);

    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}

// Handle WebSocket connections
async function handleWs(req: Request) {
  if (!acceptable(req)) {
    return new Response("Not a WebSocket request", { status: 400 });
  }

  const { conn, r: bufReader, w: bufWriter, headers } = req;
  const ws = await acceptWebSocket({
    conn,
    bufReader,
    bufWriter,
    headers,
  });

  ws.onmessage = (msg) => {
    // Example: echo back
    ws.send(msg.data);
    // TODO: integrate with gameManager/roomManager
  };

  ws.onclose = () => {
    console.log("WebSocket closed");
  };
}

// Main server
serve(async (req: Request) => {
  const url = new URL(req.url);

  // If URL starts with /ws → WebSocket
  if (url.pathname.startsWith("/ws")) {
    return handleWs(req);
  }

  // Otherwise serve static files
  return serveStatic(req);
});

console.log("Server running on http://localhost:8000");
