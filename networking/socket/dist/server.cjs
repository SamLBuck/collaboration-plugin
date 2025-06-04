//import { getNoteRegistry } from "main.ts";

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception in server.cjs:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection in server.cjs:", reason);
});

const WebSocket = require("ws");

const {
  getNote,
  sharedNotes,
  registerNote,
  registerNoteFromFile,
  deleteNote
} = require("./noteRegistry.cjs");

//registerNoteFromFile("key", "C:/Users/CSStudent/Documents/Obsidian Vault/TestNote.md");//registerNoteFromFile("key", "C:/Users/CSStudent/Documents/Obsidian Vault/TestNote.md");


const wss = new WebSocket.Server({ port: 3010 });

console.log("Server running at ws://localhost:3010");

wss.on("connection", (socket) => {
  console.log("Viewer connected");
  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("[Server] Received message:", message);

      if (message.type === "register-note") {
        const { key, content } = message.payload;
        registerNote(key, content);
        socket.send(
          JSON.stringify({
            type: "ack",
            payload: { message: `Registered '${key}'` },
          })
        );
        return;
      }
      if (message.type === "loadNote") {
        const { key, content } = message;
        registerNote(key, content);
        socket.send(
          JSON.stringify({     
            type: "ack",
            payload: { message: `Loaded note '${key}' into registry` },
          })
        );
        return;
      }
      

      if (message.type === "delete-note") {
        const { key } = message.payload;
        deleteNote(key);
        socket.send(
          JSON.stringify({
            type: "ack",
            payload: { message: `Deleted '${key}'` },
          })
        );
        return;
      }

      if (message.type === "note") {
        const key = message.payload.key;
        const content = getNote(key);
        socket.send(
          JSON.stringify({
            type: "note",
            payload: { content: content ?? "Note not found" },
          })
        );
        return;
      }

      if (message.type === "list-keys") {
        const keys = Array.from(sharedNotes.keys());
        socket.send(
          JSON.stringify({
            type: "key-list",
            payload: { keys },
          })
        );
        return;
      }
    } catch (err) {
      console.error("[Server] Error handling message:", err);
      socket.send(
        JSON.stringify({
          type: "error",
          payload: { message: "Invalid format" },
        })
      );
    }
  });
});
