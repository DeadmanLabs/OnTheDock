const express = require('express');
const { DockerControl } = require('../packages/docker-control/dist');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize our library!
const docker = new DockerControl({ socketPath: '/var/run/docker.sock' });
const upload = multer({ dest: '/tmp/uploads/' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes using our library

app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.containers.list(true);
    res.json(containers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/images', async (req, res) => {
  try {
    const images = await docker.images.list();
    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/info', async (req, res) => {
  try {
    const info = await docker.system.info();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/containers/:id/start', async (req, res) => {
  try {
    const result = await docker.containers.start(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const result = await docker.containers.stop(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/containers/:id/restart', async (req, res) => {
  try {
    const result = await docker.containers.restart(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/containers/:id', async (req, res) => {
  try {
    const result = await docker.containers.remove(req.params.id, true);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/containers/:id/logs', async (req, res) => {
  try {
    const logs = await docker.logs.get(req.params.id, { 
      tail: 100, 
      timestamps: true 
    });
    res.type('text/plain');
    res.send(logs);
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/containers/:id/stats', async (req, res) => {
  try {
    const stats = await docker.stats.get(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File management endpoints
app.get('/api/containers/:id/files', async (req, res) => {
  try {
    const result = await docker.files.list(req.params.id, req.query.path || '/');
    res.json(result);
  } catch (error) {
    console.error('Files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/containers/:id/download', async (req, res) => {
  try {
    const content = await docker.files.download(req.params.id, req.query.path);
    res.type('text/plain');
    res.send(content);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/containers/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const destPath = req.body.path || '/tmp';
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fs = require('fs');
    const fileContent = fs.readFileSync(file.path);
    
    const result = await docker.files.upload(
      req.params.id, 
      destPath, 
      file.originalname, 
      fileContent
    );
    
    // Clean up temp file
    fs.unlinkSync(file.path);
    
    res.json({ success: true, message: `File uploaded to ${result.path}` });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new container
app.post('/api/containers/create', async (req, res) => {
  try {
    const { image, name, ports, env, volumes } = req.body;
    
    const containerId = await docker.containers.create({
      image,
      name,
      ports,
      env,
      volumes
    });
    
    res.json({ success: true, id: containerId });
  } catch (error) {
    console.error('Create container error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pull image
app.post('/api/images/pull', async (req, res) => {
  try {
    const { image } = req.body;
    
    // Set response as SSE for progress updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    await docker.images.pull(image, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    
    res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Pull image error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// WebSocket for terminal
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('terminal:create', async (data) => {
    try {
      const { containerId } = data;
      
      // Find a working shell using our library
      const shell = await docker.exec.findShell(containerId);
      console.log(`Found working shell: ${shell} in container ${containerId}`);
      
      // Create exec instance
      const execId = await docker.exec.create(containerId, {
        cmd: [shell],
        attachStdin: true,
        attachStdout: true,
        attachStderr: true,
        tty: true
      });
      
      // Start the exec session
      const stream = await docker.exec.start(execId, {
        hijack: true,
        stdin: true
      });
      
      socket.execStream = stream;
      socket.execId = execId;
      
      console.log(`Connected to container ${containerId} using ${shell}`);
      
      // Handle output from container
      stream.on('data', (chunk) => {
        socket.emit('terminal:data', chunk.toString());
      });
      
      stream.on('end', () => {
        socket.emit('terminal:exit', { message: 'Session ended' });
      });
      
      stream.on('error', (err) => {
        console.error('Stream error:', err);
        socket.emit('terminal:error', { error: err.message });
      });
      
      socket.emit('terminal:connected', { 
        execId: execId, 
        shell: shell 
      });
      
    } catch (error) {
      console.error('Terminal create error:', error);
      socket.emit('terminal:error', { error: error.message });
    }
  });
  
  socket.on('terminal:input', (data) => {
    if (socket.execStream) {
      try {
        socket.execStream.write(data);
      } catch (err) {
        console.error('Failed to write to stream:', err);
      }
    }
  });
  
  socket.on('terminal:resize', async (data) => {
    try {
      if (socket.execId) {
        await docker.exec.resize(socket.execId, {
          w: data.cols,
          h: data.rows
        });
      }
    } catch (error) {
      console.error('Resize error:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    if (socket.execStream) {
      try {
        socket.execStream.end();
      } catch (err) {
        console.error('Failed to end stream:', err);
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 OnTheDock Demo Server (using library)`);
  console.log(`📦 Using @org/docker-control library`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`📊 Enhanced UI: http://localhost:${PORT}/enhanced.html`);
  console.log(`\n✨ All features powered by our TypeScript library!`);
});