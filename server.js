console.log("server.js started");

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const LOG_DIR = path.join(process.cwd(), "logs");

// Ensure logs folder exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

// Serve frontend
app.use(express.static("public"));

// Today's log path
function getTodayLogPath() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `coingecko-${today}.json`);
}

// Append new fetch
async function fetchAndAppend() {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=24h",
      {
        headers: {
          "X-CoinGecko-Api-Key": "CG-byAG6GLNCdr1hEBX7SzuGqd9"
        }
      }
    );

    const data = await response.json();
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, coins: data };

    const filePath = getTodayLogPath();
    let existing = [];
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      existing = JSON.parse(content);
    }
    existing.push(logEntry);
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

    console.log(`[${new Date().toLocaleTimeString()}] Fetched and logged CoinGecko data.`);
  } catch (err) {
    console.error("Error fetching CoinGecko data:", err);
  }
}

// Initial fetch
fetchAndAppend();

// Schedule fetch every minute
setInterval(fetchAndAppend, 20 * 1000);

// Serve latest fetch to frontend
app.get("/api/fetch-coins", (req, res) => {
  try {
    const filePath = getTodayLogPath();
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "No log file for today" });

    const dailyLogs = JSON.parse(fs.readFileSync(filePath));
    if (!dailyLogs.length) return res.status(404).json({ error: "No data in today’s log" });

    const latest = dailyLogs[dailyLogs.length - 1];
    res.json(latest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read latest log entry" });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
