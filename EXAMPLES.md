# OnTheDock Examples

Practical examples for common Docker management tasks using OnTheDock library.

## Table of Contents
- [Basic Operations](#basic-operations)
- [Container Management](#container-management)
- [Image Management](#image-management)
- [Monitoring & Logs](#monitoring--logs)
- [Interactive Sessions](#interactive-sessions)
- [File Management](#file-management)
- [Advanced Scenarios](#advanced-scenarios)
- [Express.js Integration](#expressjs-integration)
- [WebSocket Integration](#websocket-integration)

## Basic Operations

### Initialize and Check Connection

```javascript
const { DockerControl } = require('@org/docker-control');

async function checkDocker() {
  const docker = new DockerControl();
  
  try {
    // Ping Docker daemon
    await docker.system.ping();
    console.log('✅ Docker is running');
    
    // Get system info
    const info = await docker.system.info();
    console.log(`Docker version: ${info.serverVersion}`);
    console.log(`Total containers: ${info.containers}`);
    console.log(`Running containers: ${info.containersRunning}`);
    console.log(`Total images: ${info.images}`);
  } catch (error) {
    console.error('❌ Docker is not accessible:', error.message);
    process.exit(1);
  }
}

checkDocker();
```

## Container Management

### List and Inspect Containers

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function listContainers() {
  // Get all containers
  const containers = await docker.containers.list(true);
  
  console.log('All Containers:');
  containers.forEach(container => {
    const status = container.state === 'running' ? '🟢' : '🔴';
    console.log(`${status} ${container.name} (${container.image})`);
  });
  
  // Get only running containers
  const running = await docker.containers.list(false);
  console.log(`\nRunning: ${running.length}/${containers.length}`);
  
  // Inspect first running container
  if (running.length > 0) {
    const details = await docker.containers.get(running[0].id);
    console.log(`\nDetails for ${details.name}:`);
    console.log(`  State: ${details.state.Status}`);
    console.log(`  Started: ${details.state.StartedAt}`);
    console.log(`  IP: ${details.hostConfig.NetworkMode}`);
  }
}

listContainers().catch(console.error);
```

### Create and Manage Container

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function deployNginx() {
  const containerName = 'my-nginx-' + Date.now();
  
  try {
    // Create container
    console.log('Creating container...');
    const containerId = await docker.containers.create({
      image: 'nginx:alpine',
      name: containerName,
      ports: ['8080:80'],
      env: {
        NGINX_HOST: 'example.com',
        NGINX_PORT: '80'
      },
      volumes: ['/tmp/nginx-content:/usr/share/nginx/html:ro']
    });
    
    console.log(`✅ Created: ${containerId}`);
    
    // Start container
    await docker.containers.start(containerId);
    console.log('✅ Started');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check logs
    const logs = await docker.logs.get(containerId, { tail: 5 });
    console.log('\nLogs:\n', logs);
    
    // Get stats
    const stats = await docker.stats.get(containerId);
    console.log('\nStats:');
    console.log(`  CPU: ${stats.cpu.percent}%`);
    console.log(`  Memory: ${(stats.memory.usage / 1024 / 1024).toFixed(2)} MB`);
    
    // Clean up
    console.log('\nCleaning up...');
    await docker.containers.stop(containerId);
    await docker.containers.remove(containerId);
    console.log('✅ Removed');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

deployNginx();
```

### Batch Container Operations

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function stopAllContainers() {
  const running = await docker.containers.list(false);
  
  if (running.length === 0) {
    console.log('No running containers');
    return;
  }
  
  console.log(`Stopping ${running.length} containers...`);
  
  const promises = running.map(async (container) => {
    try {
      await docker.containers.stop(container.id);
      console.log(`  ✅ Stopped: ${container.name}`);
    } catch (error) {
      console.log(`  ❌ Failed to stop ${container.name}: ${error.message}`);
    }
  });
  
  await Promise.all(promises);
  console.log('Done');
}

stopAllContainers().catch(console.error);
```

## Image Management

### Pull Images with Progress

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function pullImages() {
  const images = ['alpine:latest', 'nginx:alpine', 'redis:alpine'];
  
  for (const image of images) {
    console.log(`\nPulling ${image}...`);
    
    let lastLayer = '';
    await docker.images.pull(image, (event) => {
      if (event.id && event.id !== lastLayer) {
        lastLayer = event.id;
      }
      
      if (event.status === 'Downloading') {
        process.stdout.write(`\r  ${lastLayer}: ${event.progress || ''}`);
      } else if (event.status === 'Pull complete') {
        process.stdout.write(`\r  ${lastLayer}: ✅ Complete        \n`);
      } else if (event.status === 'Already exists') {
        process.stdout.write(`\r  ${lastLayer}: Already exists     \n`);
      }
    });
    
    console.log(`✅ ${image} ready`);
  }
  
  // List all images
  const allImages = await docker.images.list();
  console.log(`\nTotal images: ${allImages.length}`);
}

pullImages().catch(console.error);
```

### Clean Unused Images

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function cleanupImages() {
  const images = await docker.images.list();
  const containers = await docker.containers.list(true);
  
  // Get images in use
  const usedImages = new Set(containers.map(c => c.image));
  
  // Find unused images
  const unused = images.filter(img => {
    const tags = img.tags || [];
    return tags.length > 0 && !tags.some(tag => usedImages.has(tag.split(':')[0]));
  });
  
  console.log(`Found ${unused.length} potentially unused images`);
  
  for (const image of unused) {
    const tag = image.tags[0];
    if (tag && !tag.includes('<none>')) {
      console.log(`Removing: ${tag}`);
      try {
        await docker.images.remove(image.id);
        console.log(`  ✅ Removed`);
      } catch (error) {
        console.log(`  ⚠️  In use or protected`);
      }
    }
  }
}

cleanupImages().catch(console.error);
```

## Monitoring & Logs

### Real-time Log Streaming

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function streamLogs(containerName) {
  console.log(`Streaming logs from ${containerName}...`);
  console.log('Press Ctrl+C to stop\n');
  
  const stream = await docker.logs.stream(containerName, (data) => {
    // Remove timestamps if present
    const cleaned = data.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/, '');
    process.stdout.write(`[${new Date().toLocaleTimeString()}] ${cleaned}`);
  }, { tail: 10 });
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\nStopping log stream...');
    stream.destroy();
    process.exit(0);
  });
}

streamLogs('my-container').catch(console.error);
```

### Real-time Stats Monitoring

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function monitorStats(containerName) {
  console.log(`Monitoring ${containerName}...`);
  console.log('Press Ctrl+C to stop\n');
  
  const stream = await docker.stats.stream(containerName, (stats) => {
    // Clear line and print stats
    process.stdout.write('\r\x1b[K'); // Clear line
    process.stdout.write(
      `CPU: ${stats.cpu.percent}% | ` +
      `Memory: ${(stats.memory.usage / 1024 / 1024).toFixed(1)} MB (${stats.memory.percent}%) | ` +
      `Network: ↓${(stats.network.rx / 1024).toFixed(1)} KB ↑${(stats.network.tx / 1024).toFixed(1)} KB`
    );
  });
  
  process.on('SIGINT', () => {
    console.log('\n\nStopping monitor...');
    stream.destroy();
    process.exit(0);
  });
}

monitorStats('my-container').catch(console.error);
```

### Combined Monitoring Dashboard

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function dashboard() {
  const containers = await docker.containers.list(false);
  
  if (containers.length === 0) {
    console.log('No running containers');
    return;
  }
  
  console.clear();
  console.log('Container Dashboard - Press Ctrl+C to exit\n');
  
  const streams = [];
  const stats = {};
  
  // Start monitoring all containers
  for (const container of containers) {
    stats[container.id] = { name: container.name, cpu: '0', memory: '0' };
    
    const stream = await docker.stats.stream(container.id, (data) => {
      stats[container.id].cpu = data.cpu.percent;
      stats[container.id].memory = data.memory.percent;
    });
    
    streams.push(stream);
  }
  
  // Update display every second
  const interval = setInterval(() => {
    console.clear();
    console.log('Container Dashboard - Press Ctrl+C to exit\n');
    console.log('Name                     CPU      Memory');
    console.log('-'.repeat(45));
    
    Object.values(stats).forEach(stat => {
      const name = stat.name.padEnd(24);
      const cpu = `${stat.cpu}%`.padEnd(8);
      const memory = `${stat.memory}%`;
      console.log(`${name} ${cpu} ${memory}`);
    });
  }, 1000);
  
  // Cleanup on exit
  process.on('SIGINT', () => {
    clearInterval(interval);
    streams.forEach(s => s.destroy());
    console.log('\nDashboard stopped');
    process.exit(0);
  });
}

dashboard().catch(console.error);
```

## Interactive Sessions

### Interactive Shell with Auto-detection

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();
const readline = require('readline');

async function shell(containerName) {
  // Find available shell
  const shell = await docker.exec.findShell(containerName);
  console.log(`Connecting to ${containerName} using ${shell}...`);
  
  // Create exec instance
  const execId = await docker.exec.create(containerName, {
    cmd: [shell],
    attachStdin: true,
    attachStdout: true,
    attachStderr: true,
    tty: true
  });
  
  // Start session
  const stream = await docker.exec.start(execId, {
    hijack: true,
    stdin: true
  });
  
  // Setup terminal
  process.stdin.setRawMode(true);
  process.stdin.pipe(stream);
  stream.pipe(process.stdout);
  
  // Resize handler
  process.stdout.on('resize', async () => {
    await docker.exec.resize(execId, {
      h: process.stdout.rows,
      w: process.stdout.columns
    });
  });
  
  // Exit handler
  stream.on('end', () => {
    process.stdin.setRawMode(false);
    process.stdin.unpipe(stream);
    console.log('\nSession ended');
    process.exit(0);
  });
}

shell('my-container').catch(console.error);
```

### Execute Commands in Multiple Containers

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function executeInAll(command) {
  const containers = await docker.containers.list(false);
  
  console.log(`Executing "${command}" in ${containers.length} containers:\n`);
  
  for (const container of containers) {
    console.log(`\n[${container.name}]`);
    
    try {
      // Create and run exec
      const execId = await docker.exec.create(container.id, {
        cmd: command.split(' '),
        attachStdout: true,
        attachStderr: true
      });
      
      const stream = await docker.exec.start(execId);
      
      // Collect output
      let output = '';
      stream.on('data', (chunk) => {
        output += chunk.toString();
      });
      
      await new Promise((resolve) => {
        stream.on('end', resolve);
      });
      
      console.log(output);
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }
}

executeInAll('hostname').catch(console.error);
```

## File Management

### Browse Container Filesystem

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function browse(containerName, startPath = '/') {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  let currentPath = startPath;
  
  while (true) {
    // List files
    const result = await docker.files.list(containerName, currentPath);
    
    console.clear();
    console.log(`Container: ${containerName}`);
    console.log(`Path: ${currentPath}\n`);
    
    // Show directories first, then files
    const dirs = result.files.filter(f => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
    const files = result.files.filter(f => !f.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
    
    dirs.forEach(d => console.log(`  📁 ${d.name}/`));
    files.forEach(f => console.log(`  📄 ${f.name} (${f.size} bytes)`));
    
    // Prompt for action
    const answer = await new Promise(resolve => {
      rl.question('\nEnter directory name, ".." to go up, or "q" to quit: ', resolve);
    });
    
    if (answer === 'q') {
      break;
    } else if (answer === '..') {
      const parts = currentPath.split('/').filter(p => p);
      parts.pop();
      currentPath = '/' + parts.join('/');
    } else {
      const dir = result.files.find(f => f.name === answer && f.isDirectory);
      if (dir) {
        currentPath = dir.path;
      } else {
        console.log('Invalid directory');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  rl.close();
}

browse('my-container').catch(console.error);
```

### Backup Container Files

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();
const fs = require('fs');
const path = require('path');

async function backupFiles(containerName, containerPath, localPath) {
  // Create local directory
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }
  
  // List files in container
  const result = await docker.files.list(containerName, containerPath);
  console.log(`Backing up ${result.files.length} items from ${containerPath}`);
  
  for (const file of result.files) {
    if (!file.isDirectory) {
      try {
        // Download file
        const content = await docker.files.download(containerName, file.path);
        
        // Save locally
        const localFile = path.join(localPath, file.name);
        fs.writeFileSync(localFile, content);
        
        console.log(`  ✅ ${file.name}`);
      } catch (error) {
        console.log(`  ❌ ${file.name}: ${error.message}`);
      }
    }
  }
  
  console.log(`\nBackup complete: ${localPath}`);
}

backupFiles('my-container', '/etc/nginx', './nginx-backup').catch(console.error);
```

### Deploy Configuration Files

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();
const fs = require('fs');

async function deployConfigs(containerName, configs) {
  console.log(`Deploying ${configs.length} configuration files...`);
  
  for (const config of configs) {
    try {
      // Read local file
      const content = fs.readFileSync(config.local);
      
      // Upload to container
      const filename = config.local.split('/').pop();
      const result = await docker.files.upload(
        containerName,
        config.remote,
        filename,
        content
      );
      
      console.log(`  ✅ ${config.local} -> ${result.path}`);
    } catch (error) {
      console.log(`  ❌ ${config.local}: ${error.message}`);
    }
  }
  
  console.log('\nDeployment complete');
}

// Example usage
deployConfigs('my-container', [
  { local: './nginx.conf', remote: '/etc/nginx' },
  { local: './index.html', remote: '/usr/share/nginx/html' },
  { local: './ssl-cert.pem', remote: '/etc/nginx/ssl' }
]).catch(console.error);
```

## Advanced Scenarios

### Health Check System

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function healthCheck() {
  const checks = {
    docker: false,
    containers: { total: 0, running: 0, healthy: 0 },
    images: 0,
    issues: []
  };
  
  // Check Docker daemon
  try {
    await docker.system.ping();
    checks.docker = true;
  } catch (error) {
    checks.issues.push('Docker daemon not responding');
    return checks;
  }
  
  // Check containers
  const containers = await docker.containers.list(true);
  checks.containers.total = containers.length;
  checks.containers.running = containers.filter(c => c.state === 'running').length;
  
  // Check container health
  for (const container of containers) {
    if (container.state === 'running') {
      try {
        const stats = await docker.stats.get(container.id);
        const cpuPercent = parseFloat(stats.cpu.percent);
        const memPercent = parseFloat(stats.memory.percent);
        
        if (cpuPercent < 90 && memPercent < 90) {
          checks.containers.healthy++;
        } else {
          checks.issues.push(`${container.name}: High resource usage (CPU: ${cpuPercent}%, Mem: ${memPercent}%)`);
        }
      } catch (error) {
        checks.issues.push(`${container.name}: Cannot get stats`);
      }
    }
  }
  
  // Check images
  const images = await docker.images.list();
  checks.images = images.length;
  
  // Report
  console.log('System Health Check');
  console.log('==================');
  console.log(`Docker Daemon: ${checks.docker ? '✅' : '❌'}`);
  console.log(`Containers: ${checks.containers.running}/${checks.containers.total} running`);
  console.log(`Healthy: ${checks.containers.healthy}/${checks.containers.running}`);
  console.log(`Images: ${checks.images}`);
  
  if (checks.issues.length > 0) {
    console.log('\nIssues:');
    checks.issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
  } else {
    console.log('\n✅ All systems healthy');
  }
  
  return checks;
}

healthCheck().catch(console.error);
```

### Container Auto-restart

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function autoRestart(watchList) {
  console.log(`Monitoring ${watchList.length} containers...`);
  console.log('Press Ctrl+C to stop\n');
  
  const checkInterval = setInterval(async () => {
    const containers = await docker.containers.list(true);
    
    for (const name of watchList) {
      const container = containers.find(c => c.name === name);
      
      if (!container) {
        console.log(`⚠️  ${name}: Not found`);
        continue;
      }
      
      if (container.state !== 'running') {
        console.log(`🔄 ${name}: Restarting (was ${container.state})`);
        try {
          await docker.containers.start(container.id);
          console.log(`  ✅ ${name}: Started`);
        } catch (error) {
          console.log(`  ❌ ${name}: Failed to start - ${error.message}`);
        }
      }
    }
  }, 10000); // Check every 10 seconds
  
  process.on('SIGINT', () => {
    clearInterval(checkInterval);
    console.log('\nMonitoring stopped');
    process.exit(0);
  });
}

autoRestart(['web-server', 'database', 'cache']).catch(console.error);
```

## Express.js Integration

### Complete REST API

```javascript
const express = require('express');
const { DockerControl } = require('@org/docker-control');

const app = express();
const docker = new DockerControl();

app.use(express.json());

// List containers
app.get('/api/containers', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const containers = await docker.containers.list(all);
    res.json(containers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get container details
app.get('/api/containers/:id', async (req, res) => {
  try {
    const container = await docker.containers.get(req.params.id);
    res.json(container);
  } catch (error) {
    res.status(404).json({ error: 'Container not found' });
  }
});

// Create container
app.post('/api/containers', async (req, res) => {
  try {
    const containerId = await docker.containers.create(req.body);
    res.status(201).json({ id: containerId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Container actions
app.post('/api/containers/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  
  try {
    switch (action) {
      case 'start':
        await docker.containers.start(id);
        break;
      case 'stop':
        await docker.containers.stop(id);
        break;
      case 'restart':
        await docker.containers.restart(id);
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete container
app.delete('/api/containers/:id', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    await docker.containers.remove(req.params.id, force);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs
app.get('/api/containers/:id/logs', async (req, res) => {
  try {
    const logs = await docker.logs.get(req.params.id, {
      tail: parseInt(req.query.tail) || 100,
      timestamps: req.query.timestamps === 'true'
    });
    res.type('text/plain').send(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get stats
app.get('/api/containers/:id/stats', async (req, res) => {
  try {
    const stats = await docker.stats.get(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List images
app.get('/api/images', async (req, res) => {
  try {
    const images = await docker.images.list();
    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System info
app.get('/api/system/info', async (req, res) => {
  try {
    const info = await docker.system.info();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Docker API running on http://localhost:3000');
});
```

## WebSocket Integration

### Real-time Dashboard with Socket.IO

```javascript
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { DockerControl } = require('@org/docker-control');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
const docker = new DockerControl();

// Track active streams
const activeStreams = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Subscribe to container logs
  socket.on('logs:subscribe', async (containerId) => {
    try {
      const stream = await docker.logs.stream(containerId, (data) => {
        socket.emit('logs:data', { containerId, data });
      }, { tail: 50 });
      
      activeStreams.set(`logs:${socket.id}:${containerId}`, stream);
      socket.emit('logs:subscribed', { containerId });
    } catch (error) {
      socket.emit('logs:error', { error: error.message });
    }
  });
  
  // Subscribe to container stats
  socket.on('stats:subscribe', async (containerId) => {
    try {
      const stream = await docker.stats.stream(containerId, (stats) => {
        socket.emit('stats:data', { containerId, stats });
      });
      
      activeStreams.set(`stats:${socket.id}:${containerId}`, stream);
      socket.emit('stats:subscribed', { containerId });
    } catch (error) {
      socket.emit('stats:error', { error: error.message });
    }
  });
  
  // Interactive terminal
  socket.on('terminal:create', async ({ containerId }) => {
    try {
      // Find shell
      const shell = await docker.exec.findShell(containerId);
      
      // Create exec
      const execId = await docker.exec.create(containerId, {
        cmd: [shell],
        attachStdin: true,
        attachStdout: true,
        attachStderr: true,
        tty: true
      });
      
      // Start session
      const stream = await docker.exec.start(execId, {
        hijack: true,
        stdin: true
      });
      
      // Store exec info
      socket.execId = execId;
      socket.execStream = stream;
      
      // Handle output
      stream.on('data', (chunk) => {
        socket.emit('terminal:data', chunk.toString());
      });
      
      stream.on('end', () => {
        socket.emit('terminal:exit');
      });
      
      socket.emit('terminal:ready', { execId, shell });
    } catch (error) {
      socket.emit('terminal:error', { error: error.message });
    }
  });
  
  // Terminal input
  socket.on('terminal:input', (data) => {
    if (socket.execStream) {
      socket.execStream.write(data);
    }
  });
  
  // Terminal resize
  socket.on('terminal:resize', async ({ cols, rows }) => {
    if (socket.execId) {
      await docker.exec.resize(socket.execId, { w: cols, h: rows });
    }
  });
  
  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Stop all streams for this client
    activeStreams.forEach((stream, key) => {
      if (key.includes(socket.id)) {
        stream.destroy();
        activeStreams.delete(key);
      }
    });
    
    // Close terminal
    if (socket.execStream) {
      socket.execStream.end();
    }
  });
});

// Broadcast system stats every 5 seconds
setInterval(async () => {
  try {
    const info = await docker.system.info();
    const containers = await docker.containers.list();
    
    io.emit('system:update', {
      info,
      containers: containers.length,
      running: containers.filter(c => c.state === 'running').length
    });
  } catch (error) {
    console.error('Failed to broadcast system stats:', error);
  }
}, 5000);

server.listen(3000, () => {
  console.log('WebSocket server running on http://localhost:3000');
});
```

### Client-side WebSocket Usage

```html
<!DOCTYPE html>
<html>
<head>
  <title>Docker Dashboard</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
  <h1>Docker Dashboard</h1>
  
  <div id="system">
    <h2>System</h2>
    <div id="systemInfo"></div>
  </div>
  
  <div id="logs">
    <h2>Container Logs</h2>
    <input type="text" id="containerId" placeholder="Container ID">
    <button onclick="subscribeLogs()">Subscribe</button>
    <pre id="logsOutput"></pre>
  </div>
  
  <script>
    const socket = io('http://localhost:3000');
    
    // System updates
    socket.on('system:update', (data) => {
      document.getElementById('systemInfo').innerHTML = `
        <p>Containers: ${data.containers} (${data.running} running)</p>
        <p>Images: ${data.info.images}</p>
        <p>Memory: ${(data.info.memTotal / 1024 / 1024 / 1024).toFixed(2)} GB</p>
      `;
    });
    
    // Logs
    function subscribeLogs() {
      const containerId = document.getElementById('containerId').value;
      socket.emit('logs:subscribe', containerId);
    }
    
    socket.on('logs:data', ({ data }) => {
      const output = document.getElementById('logsOutput');
      output.textContent += data;
      output.scrollTop = output.scrollHeight;
    });
    
    socket.on('connect', () => {
      console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  </script>
</body>
</html>
```