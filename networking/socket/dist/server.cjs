// networking/socket/dist/server.cjs

const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const {
  getNote,
  sharedNotes,
  registerNote,
  registerNoteFromFile,
  deleteNote
} = require("./noteRegistry.cjs");

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception in server.cjs:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection in server.cjs:", reason);
});

const PORT = 3010;
const wss = new WebSocket.Server({ port: PORT });

wss.on("listening", () => {
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
});
wss.on("error", (err) => {
  console.error("WebSocket Server error:", err);
});

wss.on("connection", (socket) => {
  console.log("Viewer connected");

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("[Server] Received message:", message);

      switch (message.type) {
        case "register-note": {
          const { key, content } = message.payload;
          registerNote(key, content);
          socket.send(JSON.stringify({
            type: "ack",
            payload: { message: `Registered '${key}'` },
          }));
          break;
        }
        case "loadNote": {
          const { key, content } = message;
          registerNote(key, content);
          socket.send(JSON.stringify({
            type: "ack",
            payload: { message: `Loaded note '${key}' into registry` },
          }));
          break;
        }
        case "delete-note": {
          const { key } = message.payload;
          deleteNote(key);
          socket.send(JSON.stringify({
            type: "ack",
            payload: { message: `Deleted '${key}'` },
          }));
          break;
        }
        case "push-note": {
          const { key, content } = message.payload;
          registerNote(key, content);
          wss.clients.forEach((client) => {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "push-note",
                payload: { key, content }
              }));
            }
          });
          socket.send(JSON.stringify({
            type: "ack",
            payload: { message: `Registered note '${key}' in registry` }
          }));
          break;
        }
        case "ping": {
          socket.send(JSON.stringify({
            type: "pong",
            payload: { message: "pong" }
          }));
          break;
        }
        case "note": {
          const key = message.payload.key;
          const content = getNote(key);
          socket.send(JSON.stringify({
            type: "note",
            payload: { content: content ?? "Note not found" },
          }));
          break;
        }
        case "list-keys": {
          const keys = Array.from(sharedNotes.keys());
          socket.send(JSON.stringify({
            type: "key-list",
            payload: { keys },
          }));
          break;
        }
        default:
          console.warn("[Server] Unhandled message type:", message.type);
      }
    } catch (err) {
      console.error("[Server] Error handling message:", err);
      socket.send(JSON.stringify({
        type: "error",
        payload: { message: "Invalid format" },
      }));
    }
  });
});

// ------------------------------------------------------------------
// ** HEARTBEAT: Prevent process from exiting **
// ------------------------------------------------------------------
setInterval(() => {
  // no-op, just keeps the event loop busy
}, 60 * 1000);

console.log(`Server running at ws://localhost:${PORT}`);
