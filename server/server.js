// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

// Serve static files from Next.js app (in production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', '.next', 'static')));
}

// Health-check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cabo-socket-server' });
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'cabo-socket-server' });
});

// Initialize Socket.IO via the socket module
initSocket(server);

const PORT = process.env.PORT || process.argv[2] || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});