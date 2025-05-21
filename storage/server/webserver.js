const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

let notes = {};

app.post("/publish", (req, res) => {
  const { key, content } = req.body;
  if (!key || !content) {
    return res.status(400).json({ error: "Missing key or content" });
  }
  notes[key] = content;
  console.log(`Note stored with key: ${key}`);
  res.json({ status: "ok", key });
});

app.get("/note/:key", (req, res) => {
  const content = notes[req.params.key];
  if (!content) {
    return res.status(404).send("Note not found.");
  }
  res.json({ content });
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
