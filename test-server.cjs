const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

app.post("/register", (req, res) => {
  res.json({ success: true });
});

app.listen(3000, () => {
  console.log("Listening on http://localhost:3000");
});
