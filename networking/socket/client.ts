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
  function parseShareKey(shareKey: string): { ip: string; port: number; key: string } {
    const match = shareKey.match(/^obs-collab:\/\/([\d.]+):(\d+)\/note\/(.+)$/);
    if (!match) throw new Error("Invalid share key format");
    return { ip: match[1], port: parseInt(match[2]), key: match[3] };
  }
  
  