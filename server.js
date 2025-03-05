const express = require("express");
const { Pool } = require("pg");
const redis = require("redis");
require("dotenv").config();

const app = express();
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});



const redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
        tls: true, // Required for Upstash Redis
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000), // Retry strategy
        keepAlive: 10000,
    },
});

// Connect only once at startup
(async () => {
    try {
        if (!redisClient.isOpen) { // Prevent duplicate connections
            await redisClient.connect();
            console.log("✅ Connected to Upstash Redis");
        }
    } catch (err) {
        console.error("❌ Upstash Redis Connection Error:", err);
    }
})();

// Handle Redis errors
redisClient.on("error", (err) => {
    console.error("❌ Redis error:", err);
});

module.exports = redisClient; // Export so it can be used in other files


// Store Key-Value Pair
app.post("/store", async (req, res) => {
    const { key, value } = req.body;
    if (!key || !value) return res.status(400).json({ error: "Key and value required" });

    try {
        await redisClient.set(key, value); // Cache in Redis
        await pool.query("INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value]); // Store in DB
        res.json({ message: "Stored successfully" });
    } catch (error) {
        res.status(500).json({ error: "Database error", details: error.message });
    }
});

// Retrieve Value by Key
app.get("/retrieve/:key", async (req, res) => {
    const { key } = req.params;

    try {
        let value = await redisClient.get(key); // Check Redis first
        if (value) return res.json({ key, value, source: "Redis" });

        // Fetch from PostgreSQL if not found in Redis
        const result = await pool.query("SELECT value FROM kv_store WHERE key = $1", [key]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Key not found" });

        value = result.rows[0].value;
        await redisClient.set(key, value); // Cache for future
        res.json({ key, value, source: "PostgreSQL" });
    } catch (error) {
        res.status(500).json({ error: "Database error", details: error.message });
    }
});

// Delete a Key
app.delete("/delete/:key", async (req, res) => {
    const { key } = req.params;

    try {
        await redisClient.del(key); // Remove from Redis
        await pool.query("DELETE FROM kv_store WHERE key = $1", [key]); // Remove from PostgreSQL
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Database error", details: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
