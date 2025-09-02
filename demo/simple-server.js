const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const path = require('path');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/api/containers/:id/logs', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const stream = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,
      timestamps: true
    });
    
    res.type('text/plain');
    stream.pipe(res);
  } catch (error) {
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Demo server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`🔌 API endpoints:`);
  console.log(`   GET  /api/containers`);
  console.log(`   GET  /api/images`);
  console.log(`   GET  /api/info`);
  console.log(`   POST /api/containers/:id/start`);
  console.log(`   POST /api/containers/:id/stop`);
  console.log(`   POST /api/containers/:id/restart`);
  console.log(`   DEL  /api/containers/:id`);
  console.log(`   GET  /api/containers/:id/logs`);
  console.log(`   GET  /api/containers/:id/stats`);
});