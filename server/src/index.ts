import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { registerSocketHandlers } from './socket';
import { createEngineContext } from './store/RoomStore';

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

const ctx = createEngineContext();

if (process.env['NODE_ENV'] === 'production') {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

registerSocketHandlers(io, ctx);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
