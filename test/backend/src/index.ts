import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';

import { DockerControl } from '@org/docker-control';
import { setupRoutes } from './routes';
import { setupSocketHandlers } from './sockets';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});

// Docker Control instance
const dockerControl = new DockerControl({
  transport: {
    type: process.env.DOCKER_TRANSPORT as 'socket' | 'tcp' || 'socket',
    socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    host: process.env.DOCKER_HOST,
    port: process.env.DOCKER_PORT ? parseInt(process.env.DOCKER_PORT) : undefined
  },
  request: {
    timeout: 60000,
    retries: 3,
    debug: process.env.DEBUG === 'true'
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Rate limiting
app.use('/api', rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup routes
setupRoutes(app, dockerControl);

// Setup Socket.IO handlers
setupSocketHandlers(io, dockerControl);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Connect to Docker
    await dockerControl.connect();
    console.log('✅ Connected to Docker Engine');

    // Get Docker info
    const info = await dockerControl.system.getInfo();
    console.log(`📦 Docker Version: ${info.ServerVersion}`);
    console.log(`🐳 Containers: ${info.Containers} (${info.ContainersRunning} running)`);
    console.log(`🖼️  Images: ${info.Images}`);

    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket server ready`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await dockerControl.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await dockerControl.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the application
start().catch(console.error);