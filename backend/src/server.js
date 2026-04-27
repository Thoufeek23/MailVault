require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const connectDB = require('./config/db');
require('./config/passport');
const User = require('./models/User');
const { registerClient } = require('./services/inboxMonitorService');
const authRoutes = require('./routes/authRoutes');
const backupRoutes = require('./routes/backupRoutes');

const app = express();
connectDB();

const allowedOrigins = new Set([
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean));

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use('/auth', authRoutes);
app.use('/api/backup', backupRoutes);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const getTokenFromCookie = (cookieHeader) => {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookiePair of cookies) {
    const [rawKey, rawValue] = cookiePair.split('=');
    if (rawKey && rawKey.trim() === 'jwt') {
      return rawValue ? decodeURIComponent(rawValue.trim()) : null;
    }
  }

  return null;
};

server.on('upgrade', async (req, socket, head) => {
  try {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname !== '/ws/inbox-monitor') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const token = getTokenFromCookie(req.headers.cookie);
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = String(user._id);
      wss.emit('connection', ws);
    });
  } catch (error) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  registerClient(ws.userId, ws);
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));