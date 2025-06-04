const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors({
  origin: "*", // allow any origin (can restrict to 'app://obsidian.md' later)
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

// Handle preflight explicitly (optional but safe)
app.options("*", cors());

// DNS record handlera
app.post("/register", async (req, res) => {
  const { subdomain, ip } = req.body;
  console.log(`DNS Register Called → ${subdomain}.${ip}`);
  return res.json({ success: true, msg: "Simulated DNS registration" });
});

// (Optional) Catch-all GET
app.get("/", (req, res) => {
  res.send("DNS Collaboration Server is up.");
});

app.listen(3000, () => {
  console.log("DNS API server listening at http://localhost:3000");
});
