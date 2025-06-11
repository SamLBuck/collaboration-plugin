//import { getNoteRegistry } from "main.ts";
const fs = require("fs");
const path = require("path");


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

      if (message.type === "push-note") {
        const { key, content } = message.payload;
        console.log(`[Server] Received push-note for '${key}'`);
      
        registerNote(key, content); // Overwrites or creates in registry
      
        const result = handlePushNoteToVault(key, content);
      
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] Push received for '${key}'\nSaved at: ${result.filePath ?? "N/A"}\n\n`;
        try {
          fs.writeFileSync("last_push.txt", logMessage + content, "utf-8");
        } catch (e) {
          console.error("[Server] Failed to write debug push file:", e);
        }
      
        if (result.success) {
          socket.send(JSON.stringify({
            type: "ack",
            payload: { message: `Note '${key}' pushed and written to '${result.filePath}'` }
          }));
        } else {
          socket.send(JSON.stringify({
            type: "error",
            payload: { message: `Failed to write pushed note: ${result.error}` }
          }));
        }
      
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



function handlePushNoteToVault(key, content) {
  const vaultPath = "C:/Users/CSStudent/Documents/Obsidian Vault"; // Replace with dynamic config if desired
  const potentialFilenames = getPotentialFilenames(key);

  for (const filename of potentialFilenames) {
    const fullPath = path.join(vaultPath, filename);

    try {
      if (fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, content, "utf-8");
        sharedNotes.set(key, content);
        return {
          success: true,
          message: `Overwrote existing note '${filename}'`,
          filePath: fullPath
        };
      }
    } catch (err) {
      console.error(`[Server] Failed to write to '${filename}':`, err);
      return { success: false, error: err.message };
    }
  }

  // Create new note if no match found
  const fallbackPath = path.join(vaultPath, potentialFilenames[0]);
  try {
    fs.writeFileSync(fallbackPath, content, "utf-8");
    sharedNotes.set(key, content);
    return {
      success: true,
      message: `Created new note '${potentialFilenames[0]}'`,
      filePath: fallbackPath
    };
  } catch (err) {
    console.error(`[Server] Failed to create note:`, err);
    return { success: false, error: err.message };
  }
}
// It does NOT sanitize the key for server communication, as the server expects the original name.
function getPotentialFilenames(userProvidedKey) {
  const originalFilename = `${userProvidedKey}.md`;
  // Common Obsidian sanitization: space to underscore, often retaining apostrophes.
  const sanitizedFilename = `${userProvidedKey.replace(/\s/g, '_')}.md`;
  // More aggressive sanitization (if Obsidian does more than just spaces or apostrophes, e.g., strips apostrophe)
  const aggressiveSanitizedFilename = `${userProvidedKey.replace(/[^a-zA-Z0-9_']/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}.md`;

  // Return in order of preference/likelihood
  const potentialNames = [originalFilename]; // Try original first
  if (sanitizedFilename !== originalFilename) {
      potentialNames.push(sanitizedFilename); // Then the common space-to-underscore
  }
  if (aggressiveSanitizedFilename !== originalFilename && aggressiveSanitizedFilename !== sanitizedFilename) {
      potentialNames.push(aggressiveSanitizedFilename); // Then a more aggressive, just in case
  }
  // Remove duplicates if any (e.g., if original is already "Jon_s_Note")
  return [...new Set(potentialNames)];
}
