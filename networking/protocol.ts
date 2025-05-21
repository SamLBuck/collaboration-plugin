export interface NotePayload {
    key: string;
    content: string;
  }
  
  export interface Message {
    type: "note" | "ping" | "ack" | "error";
    payload: any;
  }
  
  