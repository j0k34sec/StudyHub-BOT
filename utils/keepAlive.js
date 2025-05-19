const express = require('express');
const server = express();

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