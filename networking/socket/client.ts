export async function requestNoteFromPeer(url: string, key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
  
      socket.onerror = (err) => {
        console.error("Socket error:", err);
        reject("Failed to connect.");
      };
  
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "note", payload: { key } }));
      };
  
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data.toString());
          if (message.type === "note") {
            resolve(message.payload.content);
          } else {
            reject(message.payload.message);
          }
        } catch (err) {
          reject("Error  response.");
        }
      };
    });
  }
  