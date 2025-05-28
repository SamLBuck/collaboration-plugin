// src/networking/socket/client.ts

export async function requestNoteFromPeer(url: string, key: string): Promise<string> {
  console.log(`[Client] Initiating connection to: ${url}`);
  console.log(`[Client] Requesting note with key: '${key}'`);

  return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);

      socket.onerror = (err) => {
          console.error("[Client] WebSocket connection error:", err);
          reject("Failed to connect to peer.");
      };

      socket.onopen = () => {
          console.log("[Client] Connection established. Sending note request...");
          const payload = JSON.stringify({ type: "note", payload: { key } });
          console.log("[Client] Sending payload:", payload);
          socket.send(payload);
      };

      socket.onmessage = (event) => {
          console.log("[Client] Message received from server:", event.data.toString());
          try {
              const message = JSON.parse(event.data.toString());

              if (message.type === "note") {
                  console.log("[Client] Note content received.");
                  resolve(message.payload.content);
              } else {
                  console.warn("[Client] Received unexpected message type:", message.type);
                  reject(message.payload.message || "Unexpected message format.");
              }
          } catch (err) {
              console.error("[Client] Failed to parse server message:", event.data);
              reject("Malformed response from server.");
          } finally {
              socket.close(); // Close socket after receiving message
          }
      };

      socket.onclose = () => {
          console.log("[Client] WebSocket connection closed.");
      };
  });
}

export function registerNoteWithPeer(url: string, key: string, content: string) {
  const socket = new WebSocket(url);

  socket.onopen = () => {
      const message = {
          type: "register-note",
          payload: { key, content }
      };
      socket.send(JSON.stringify(message));
      socket.close();
  };

  socket.onerror = (err) => {
      console.error("[Plugin] Failed to connect to peer for registration", err);
  };
}

export async function sendDeleteNoteToServer(serverUrl: string, key: string): Promise<void> {
    const socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        const message = {
            type: "delete-note",
            payload: { key },
        };
        socket.send(JSON.stringify(message));
        console.log(`[Client] Sent delete-note message for key '${key}' to server.`);
        socket.close();
    };

    socket.onerror = (err) => {
        console.error(`[Client] Failed to send delete-note message for key '${key}':`, err);
    };
}
