const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const stream = require('stream');
const tar = require('tar-stream');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const upload = multer({ dest: '/tmp/uploads/' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to properly decode Docker multiplexed stream
function decodeDockerStream(buffer) {
  if (!buffer || buffer.length === 0) return '';
  
  let output = '';
  let offset = 0;
  
  while (offset < buffer.length) {
    // Need at least 8 bytes for header
    if (offset + 8 > buffer.length) break;
    
    // Read header
    const header = buffer.slice(offset, offset + 8);
    const streamType = header[0];
    const length = header.readUInt32BE(4);
    
    offset += 8;
    
    // Check if we have enough data
    if (offset + length > buffer.length) break;
    
    // Extract the payload
    const payload = buffer.slice(offset, offset + length);
    output += payload.toString('utf8');
    
    offset += length;
  }
  
  return output;
}

// API Routes
app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json(containers.map(container => ({
      id: container.Id,
      name: container.Names[0]?.replace('/', ''),
      image: container.Image,
      state: container.State,
      status: container.Status,
      created: container.Created,
      ports: container.Ports || []
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/images', async (req, res) => {
  try {
    const images = await docker.listImages();
    res.json(images.map(image => ({
      id: image.Id,
      tags: image.RepoTags || [],
      size: image.Size,
      created: image.Created
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/info', async (req, res) => {
  try {
    const info = await docker.info();
    const version = await docker.version();
    res.json({
      containers: info.Containers,
      containersRunning: info.ContainersRunning,
      images: info.Images,
      serverVersion: version.Version,
      apiVersion: version.ApiVersion,
      os: info.OperatingSystem,
      kernelVersion: info.KernelVersion,
      memTotal: info.MemTotal,
      cpus: info.NCPU
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/containers/:id/start', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/containers/:id/restart', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/containers/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.remove({ force: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fixed logs endpoint with proper stream decoding
app.get('/api/containers/:id/logs', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    
    // Get container info to check if it's using TTY
    const containerInfo = await container.inspect();
    const isTTY = containerInfo.Config.Tty;
    
    const logOptions = {
      stdout: true,
      stderr: true,
      tail: 100,
      timestamps: true,
      follow: false
    };
    
    const logStream = await container.logs(logOptions);
    
    res.type('text/plain');
    
    if (Buffer.isBuffer(logStream)) {
      // If it's a buffer, decode it properly
      if (isTTY) {
        // TTY mode - no multiplexing, direct output
        res.send(logStream.toString('utf8'));
      } else {
        // Non-TTY mode - need to demultiplex
        const decoded = decodeDockerStream(logStream);
        res.send(decoded);
      }
    } else {
      // It's a stream - handle it
      let chunks = [];
      
      logStream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      logStream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (isTTY) {
          res.send(buffer.toString('utf8'));
        } else {
          const decoded = decodeDockerStream(buffer);
          res.send(decoded);
        }
      });
      
      logStream.on('error', (err) => {
        console.error('Log stream error:', err);
        res.status(500).json({ error: err.message });
      });
    }
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/containers/:id/stats', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const stats = await container.stats({ stream: false });
    
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
    
    const memUsage = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 1;
    const memPercent = (memUsage / memLimit) * 100;
    
    res.json({
      cpu: { percent: cpuPercent.toFixed(2) },
      memory: { 
        usage: memUsage,
        limit: memLimit,
        percent: memPercent.toFixed(2)
      },
      network: {
        rx: stats.networks?.eth0?.rx_bytes || 0,
        tx: stats.networks?.eth0?.tx_bytes || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File management endpoints
app.get('/api/containers/:id/files', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const targetPath = req.query.path || '/';
    
    // Execute ls command to list files
    const exec = await container.exec({
      Cmd: ['ls', '-la', targetPath],
      AttachStdout: true,
      AttachStderr: true
    });
    
    const stream = await exec.start({ Detach: false });
    let output = Buffer.alloc(0);
    
    stream.on('data', (chunk) => {
      output = Buffer.concat([output, chunk]);
    });
    
    stream.on('end', () => {
      // Decode the Docker stream format
      const decoded = decodeDockerStream(output);
      const lines = decoded.split('\n').filter(line => line.trim());
      const files = [];
      
      // Parse ls output (skip first line which is total)
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts.length >= 9) {
          const permissions = parts[0];
          const size = parseInt(parts[4]) || 0;
          const name = parts.slice(8).join(' ');
          
          if (name !== '.' && name !== '..') {
            files.push({
              name,
              size,
              isDirectory: permissions.startsWith('d'),
              permissions,
              path: targetPath === '/' ? `/${name}` : `${targetPath}/${name}`
            });
          }
        }
      }
      
      res.json({ path: targetPath, files });
    });
  } catch (error) {
    console.error('Files error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download file from container
app.get('/api/containers/:id/download', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const filepath = req.query.path;
    
    if (!filepath) {
      return res.status(400).json({ error: 'Path parameter is required' });
    }
    
    const stream = await container.getArchive({ path: filepath });
    const extract = tar.extract();
    
    extract.on('entry', (header, stream, next) => {
      let data = '';
      stream.on('data', (chunk) => {
        data += chunk.toString();
      });
      stream.on('end', () => {
        res.type('text/plain');
        res.send(data);
        next();
      });
      stream.resume();
    });
    
    stream.pipe(extract);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new container
app.post('/api/containers/create', async (req, res) => {
  try {
    const { image, name, ports, env, volumes } = req.body;
    
    // Build port bindings
    const portBindings = {};
    const exposedPorts = {};
    if (ports) {
      ports.forEach(port => {
        const [hostPort, containerPort] = port.split(':');
        exposedPorts[`${containerPort}/tcp`] = {};
        portBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort }];
      });
    }
    
    // Build environment variables
    const envArray = env ? Object.entries(env).map(([key, value]) => `${key}=${value}`) : [];
    
    // Build volumes
    const binds = volumes ? volumes.map(v => {
      const [host, container] = v.split(':');
      return `${host}:${container}`;
    }) : [];
    
    const container = await docker.createContainer({
      Image: image,
      name: name,
      Env: envArray,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: binds
      }
    });
    
    res.json({ success: true, id: container.id });
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
    
    const stream = await docker.pull(image);
    
    docker.modem.followProgress(stream, (err, output) => {
      if (err) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ success: true, output })}\n\n`);
      }
      res.end();
    }, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
  } catch (error) {
    console.error('Pull image error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload file to container
app.post('/api/containers/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const destPath = req.body.path || '/tmp';
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Create tar archive
    const pack = tar.pack();
    const fs = require('fs');
    const fileContent = fs.readFileSync(file.path);
    
    pack.entry({ name: file.originalname }, fileContent);
    pack.finalize();
    
    await container.putArchive(pack, { path: destPath });
    
    // Clean up temp file
    fs.unlinkSync(file.path);
    
    res.json({ success: true, message: `File uploaded to ${destPath}/${file.originalname}` });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket for terminal with shell fallback
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('terminal:create', async (data) => {
    try {
      const { containerId } = data;
      const container = docker.getContainer(containerId);
      
      // First, check which shell is available
      const shells = ['/bin/bash', '/bin/sh', '/bin/ash', 'sh'];
      let workingShell = null;
      
      for (const shell of shells) {
        try {
          // Test if shell exists using a simple echo command
          const testExec = await container.exec({
            Cmd: [shell, '-c', 'echo test'],
            AttachStdout: true,
            AttachStderr: true
          });
          
          const testStream = await testExec.start({ Detach: false });
          
          // Collect output to verify shell works
          let output = '';
          await new Promise((resolve) => {
            testStream.on('data', (chunk) => {
              output += chunk.toString();
            });
            testStream.on('end', resolve);
            testStream.on('error', resolve);
            // Set timeout to avoid hanging
            setTimeout(resolve, 1000);
          });
          
          // If we got "test" in output, shell works
          if (output.includes('test')) {
            workingShell = shell;
            console.log(`Found working shell: ${shell} in container ${containerId}`);
            break;
          }
        } catch (err) {
          // Shell doesn't exist, try next
          console.log(`Shell ${shell} not available in container`);
        }
      }
      
      if (!workingShell) {
        throw new Error('No compatible shell found in container. Tried: ' + shells.join(', '));
      }
      
      // Now create the actual interactive session with the working shell
      const exec = await container.exec({
        Cmd: [workingShell],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true
      });
      
      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true
      });
      
      socket.execStream = stream;
      socket.execId = exec.id;
      
      console.log(`Connected to container ${containerId} using ${workingShell}`);
      
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
        execId: exec.id, 
        shell: workingShell 
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
        const exec = docker.getExec(socket.execId);
        await exec.resize({
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
  console.log(`🚀 Enhanced demo server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`📊 Enhanced UI: http://localhost:${PORT}/enhanced.html`);
  console.log(`🔌 API endpoints:`);
  console.log(`   GET  /api/containers`);
  console.log(`   GET  /api/images`);
  console.log(`   GET  /api/info`);
  console.log(`   POST /api/containers/:id/start`);
  console.log(`   POST /api/containers/:id/stop`);
  console.log(`   POST /api/containers/:id/restart`);
  console.log(`   DEL  /api/containers/:id`);
  console.log(`   GET  /api/containers/:id/logs (FIXED)`);
  console.log(`   GET  /api/containers/:id/stats`);
  console.log(`   GET  /api/containers/:id/files?path=/`);
  console.log(`   GET  /api/containers/:id/download?path=/file`);
  console.log(`   POST /api/containers/:id/upload`);
  console.log(`   POST /api/containers/create`);
  console.log(`   POST /api/images/pull`);
  console.log(`🔧 WebSocket: Terminal with shell auto-detection`);
});