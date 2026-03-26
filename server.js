const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
// CRITICAL: 0.0.0.0 is required for Railway/Production
const hostname = dev ? 'localhost' : '0.0.0.0'; 
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const jogadores = {};

  io.on('connection', (socket) => {
    console.log('🟢 Player connected:', socket.id);
    jogadores[socket.id] = { id: socket.id, x: 0, y: 0, z: 0, lanternaLigada: false, corUV: false };
    
    socket.emit('estadoInicial', jogadores);
    socket.broadcast.emit('novoJogador', jogadores[socket.id]);

    socket.on('movimento', (dados) => {
      if (jogadores[socket.id]) {
        jogadores[socket.id] = { ...jogadores[socket.id], ...dados };
      }
      socket.broadcast.emit('jogadorMoveu', { id: socket.id, ...dados });
    });

    socket.on('disconnect', () => {
      console.log('🔴 Player disconnected:', socket.id);
      delete jogadores[socket.id];
      io.emit('jogadorDesconectou', socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`🚀 Server ready on port ${port}`);
  });
});