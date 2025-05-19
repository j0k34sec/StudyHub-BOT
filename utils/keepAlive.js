const express = require('express');
const fs = require('fs');
const path = require('path');
const server = express();

// Log file path
const logFilePath = path.join(__dirname, '..', 'logs', 'uptime.log');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Function to log uptime interactions
function logUptimeInteraction(route, ip) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Ping received on ${route} from ${ip}\n`;
    
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) {
            console.error('Error writing to uptime log:', err);
        }
    });
    
    // Also log to console
    console.log(`Uptime ping: ${route} from ${ip}`);
}

// Middleware to log all requests
server.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    logUptimeInteraction(req.path, ip);
    next();
});

// Basic routes for health checks
server.get('/', (req, res) => {
    res.send('Hello. I am alive!');
});

server.get('/random', (req, res) => {
    const number = Math.floor(Math.random() * 100) + 1;
    res.send(number.toString());
});

server.get('/healthcheck', (req, res) => {
    res.send('Alive');
});

function keepAlive() {
    server.listen(process.env.PORT || 3000, () => {
        console.log('Server is ready on port', process.env.PORT || 3000);
    });
}

// Start the server if this file is run directly
if (require.main === module) {
    keepAlive();
}

module.exports = keepAlive;