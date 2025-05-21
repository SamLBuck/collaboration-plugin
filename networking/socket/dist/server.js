"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const sharedNotes = new Map([
    ["test", "# This is a shared note from the creator vaul."]
]);
const wss = new ws_1.default.Server({ port: 3010 });
wss.on("connection", (socket) => {
    console.log("Viewer connected");
    socket.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log("Received:", message);
            if (message.type === "note") {
                const content = sharedNotes.get(message.payload.key);
                socket.send(JSON.stringify({
                    type: "note",
                    payload: { content: content ?? "Note not found" }
                }));
            }
        }
        catch (err) {
            console.error("Error:", err);
            socket.send(JSON.stringify({
                type: "error",
                payload: { message: "Invalid format" }
            }));
        }
    });
});
console.log("Server running at ws://localhost:3010");
