const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const publicDir = path.join(__dirname, "public");

// Serve static files
app.use(express.static(publicDir));

// Patient / User
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "user.html"));
});

app.get("/user", (req, res) => {
  res.sendFile(path.join(publicDir, "user.html"));
});

app.get("/user/", (req, res) => {
  res.sendFile(path.join(publicDir, "user.html"));
});

// Hospital Admin
app.get("/hospital-admin", (req, res) => {
  res.sendFile(path.join(publicDir, "hospital-admin.html"));
});

app.get("/hospital-admin/", (req, res) => {
  res.sendFile(path.join(publicDir, "hospital-admin.html"));
});

// Super Admin
app.get("/super-admin", (req, res) => {
  res.sendFile(path.join(publicDir, "super-admin.html"));
});

app.get("/super-admin/", (req, res) => {
  res.sendFile(path.join(publicDir, "super-admin.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).send("MediCare server is running");
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`MediCare running on port ${PORT}`);
});