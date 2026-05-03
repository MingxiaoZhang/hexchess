import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { registerSocketHandlers } from './socket';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Serve built client in production
if (process.env['NODE_ENV'] === 'production') {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
