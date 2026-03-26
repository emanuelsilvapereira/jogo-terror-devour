const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Erro na requisição HTTP', err);
      res.statusCode = 500;
      res.end('Erro interno do servidor');
    }
  });

  const io = new Server(httpServer, { cors: { origin: '*' } });

  // Memória do servidor: guarda todo mundo que está na casa
  const jogadores = {};

  io.on('connection', (socket) => {
    console.log('🟢 Novo jogador conectado! ID:', socket.id);

    // 1. Cadastra o novato na lista de presença
    jogadores[socket.id] = { id: socket.id, x: 0, y: 0, z: 0, lanternaLigada: false, corUV: false };

    // 2. Manda a lista completa para quem acabou de entrar
    socket.emit('estadoInicial', jogadores);

    // 3. Avisa os outros que já estavam lá que um novato chegou
    socket.broadcast.emit('novoJogador', jogadores[socket.id]);

    socket.on('movimento', (dados) => {
      // Atualiza a posição na memória
      if (jogadores[socket.id]) {
        jogadores[socket.id] = { ...jogadores[socket.id], ...dados };
      }
      socket.broadcast.emit('jogadorMoveu', { id: socket.id, ...dados });
    });

    socket.on('disconnect', () => {
      console.log('🔴 Jogador saiu da partida:', socket.id);
      delete jogadores[socket.id]; // Tira o jogador da lista
      io.emit('jogadorDesconectou', socket.id);
    });
  });

  httpServer
    .once('error', (err) => { console.error(err); process.exit(1); })
    .listen(port, () => { console.log(`🚀 Servidor Multiplayer rodando em http://${hostname}:${port}`); });
});