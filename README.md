# OnTheDock 🐳

A powerful, TypeScript-first Docker management library with real-time capabilities, providing a clean abstraction over the Docker Engine API.

## Overview

OnTheDock is a comprehensive Docker management library that simplifies container orchestration, image management, and system monitoring. Built with TypeScript, it offers type-safe APIs, real-time event streaming, and WebSocket support for interactive features like terminal access and live logs.

## Features

### Core Capabilities
- **Container Management**: Create, start, stop, restart, and remove containers
- **Image Operations**: Pull, list, and manage Docker images  
- **Real-time Monitoring**: Stream logs, stats, and Docker events
- **Interactive Terminal**: WebSocket-based terminal access with automatic shell detection
- **File Management**: Browse, upload, and download files from containers
- **System Information**: Monitor Docker daemon status and resource usage

### Technical Highlights
- 🔷 **TypeScript First**: Full type safety with comprehensive interfaces
- 🔄 **Real-time Streaming**: EventEmitter-based architecture for live updates
- 🔌 **WebSocket Support**: Built-in Socket.IO integration for bidirectional communication
- 🛡️ **Security**: Input validation, rate limiting, and secure exec handling
- 📊 **Metrics & Stats**: Real-time CPU, memory, and network monitoring
- 🔧 **Shell Detection**: Automatic fallback between bash, sh, and ash shells

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     OnTheDock Library                    │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Containers  │  │    Images    │  │    System    │  │
│  │   Service    │  │   Service    │  │   Service    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │     Logs     │  │    Events    │  │     Exec     │  │
│  │   Service    │  │   Service    │  │   Service    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    Files     │  │    Stats     │  │   Networks   │  │
│  │   Service    │  │   Service    │  │   Service    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    Docker Engine API                     │
└─────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install @org/docker-control
```

## Dependencies

### Core Dependencies
- **dockerode** (^4.0.0): Docker Engine API client
- **socket.io** (^4.5.0): WebSocket support for real-time features
- **express** (^4.18.0): HTTP server framework
- **tar-stream** (^3.0.0): TAR archive handling for file operations
- **multer** (^1.4.5): Multipart file upload handling

### Development Dependencies
- **TypeScript** (^5.0.0): Type-safe development
- **@types/node**: Node.js type definitions
- **@types/dockerode**: Docker API type definitions
- **Jest**: Testing framework
- **ESLint**: Code quality and linting

## Quick Start

### Basic Usage

```typescript
import { DockerControl } from '@org/docker-control';

// Initialize the Docker control instance
const docker = new DockerControl({
  socketPath: '/var/run/docker.sock', // Unix socket (default)
  // or
  host: 'localhost',
  port: 2375 // TCP connection
});

// List all containers
const containers = await docker.containers.list({ all: true });
console.log(containers);

// Start a container
await docker.containers.start('container-id');

// Stream container logs
const logStream = docker.logs.stream('container-id', {
  stdout: true,
  stderr: true,
  follow: true
});

logStream.on('data', (chunk) => {
  console.log('Log:', chunk.toString());
});
```

### Express Server Integration

```javascript
const express = require('express');
const { DockerControl } = require('@org/docker-control');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const docker = new DockerControl();

// REST API endpoints
app.get('/api/containers', async (req, res) => {
  const containers = await docker.containers.list({ all: true });
  res.json(containers);
});

app.post('/api/containers/:id/start', async (req, res) => {
  await docker.containers.start(req.params.id);
  res.json({ success: true });
});

// WebSocket for real-time features
io.on('connection', (socket) => {
  // Stream logs
  socket.on('logs:subscribe', async ({ containerId }) => {
    const stream = docker.logs.stream(containerId, { follow: true });
    stream.on('data', (chunk) => {
      socket.emit('logs:data', chunk.toString());
    });
  });

  // Interactive terminal
  socket.on('terminal:create', async ({ containerId }) => {
    const exec = await docker.exec.create(containerId, {
      Cmd: ['/bin/sh'],
      AttachStdin: true,
      AttachStdout: true,
      Tty: true
    });
    
    const stream = await exec.start({ hijack: true, stdin: true });
    
    socket.on('terminal:input', (data) => {
      stream.write(data);
    });
    
    stream.on('data', (chunk) => {
      socket.emit('terminal:output', chunk.toString());
    });
  });
});

server.listen(3000);
```

### Container Creation

```typescript
// Create a new container
const container = await docker.containers.create({
  Image: 'nginx:latest',
  name: 'my-nginx',
  ExposedPorts: {
    '80/tcp': {}
  },
  HostConfig: {
    PortBindings: {
      '80/tcp': [{ HostPort: '8080' }]
    }
  }
});

// Start the container
await container.start();
```

### Image Management

```typescript
// Pull an image with progress tracking
const pullStream = await docker.images.pull('ubuntu:latest');

pullStream.on('progress', (event) => {
  console.log(`${event.status}: ${event.progress || ''}`);
});

pullStream.on('complete', () => {
  console.log('Image pulled successfully');
});

// List all images
const images = await docker.images.list();
```

### Real-time Stats Monitoring

```typescript
// Monitor container stats
const statsStream = docker.stats.stream('container-id');

statsStream.on('data', (stats) => {
  console.log(`CPU: ${stats.cpu.percent}%`);
  console.log(`Memory: ${stats.memory.usage} / ${stats.memory.limit}`);
  console.log(`Network RX: ${stats.network.rx}, TX: ${stats.network.tx}`);
});
```

### File Operations

```typescript
// List files in container
const files = await docker.files.list('container-id', '/app');

// Download file from container
const fileContent = await docker.files.download('container-id', '/app/config.json');

// Upload file to container
await docker.files.upload('container-id', '/app/data.json', Buffer.from('{"key": "value"}'));
```

## Demo Application

The repository includes a fully-featured demo application showcasing all capabilities:

### Running the Demo

```bash
# Clone the repository
git clone https://github.com/yourusername/OnTheDock.git
cd OnTheDock

# Install dependencies
npm install

# Start the enhanced demo server
cd demo
npm install
node enhanced-server.js

# Access the UI at http://localhost:3001/enhanced.html
```

### Demo Features
- **Container Dashboard**: View and manage all containers
- **Image Registry**: Pull and manage Docker images  
- **Interactive Terminal**: Connect to container shells with automatic shell detection
- **Log Viewer**: Stream container logs in real-time with proper stream decoding
- **File Browser**: Navigate and manage container filesystems
- **Stats Monitor**: Real-time resource usage graphs
- **Container Creation Wizard**: Create containers with custom configurations

### Key Improvements in Demo
- **Fixed Docker Stream Decoding**: Properly handles Docker's multiplexed stream format for clean log output
- **Automatic Shell Detection**: Falls back from bash → sh → ash for maximum compatibility
- **Enhanced Terminal**: WebSocket-based terminal with resize support
- **File Management**: Upload/download files with TAR archive support

## API Reference

### Container Service
- `list(options?)`: List all containers
- `create(config)`: Create a new container
- `start(id)`: Start a container
- `stop(id)`: Stop a container
- `restart(id)`: Restart a container
- `remove(id, options?)`: Remove a container
- `inspect(id)`: Get detailed container information

### Image Service
- `list()`: List all images
- `pull(image, options?)`: Pull an image from registry
- `remove(id)`: Remove an image
- `inspect(id)`: Get detailed image information

### Logs Service
- `get(containerId, options?)`: Get container logs
- `stream(containerId, options?)`: Stream container logs

### Exec Service
- `create(containerId, options)`: Create exec instance
- `start(execId, options)`: Start exec instance
- `resize(execId, dimensions)`: Resize TTY

### Stats Service
- `get(containerId)`: Get container stats snapshot
- `stream(containerId)`: Stream container stats

### Events Service
- `stream(options?)`: Stream Docker system events

### File Service
- `list(containerId, path)`: List files in directory
- `download(containerId, path)`: Download file
- `upload(containerId, path, content)`: Upload file

## Security Considerations

OnTheDock implements several security measures:

1. **Input Validation**: All user inputs are sanitized and validated
2. **Rate Limiting**: Built-in rate limiting for API endpoints
3. **Secure Exec**: Controlled command execution with shell escape handling
4. **Permission Checks**: Validates Docker socket permissions
5. **Error Handling**: Comprehensive error handling prevents information leakage

## Project Structure

```
OnTheDock/
├── demo/                      # Demo application
│   ├── enhanced-server.js     # Enhanced demo with all features
│   ├── simple-server.js       # Simple demo server
│   └── public/
│       ├── index.html         # Basic UI
│       └── enhanced.html      # Full-featured UI
├── packages/
│   └── docker-control/        # Core TypeScript library
│       ├── src/
│       │   ├── index.ts       # Main export
│       │   └── services/      # Service modules
│       ├── package.json
│       └── tsconfig.json
├── test/
│   ├── backend/              # Express.js backend
│   └── frontend/             # React frontend
├── package.json              # Root monorepo config
├── MISSION.md               # Project specification
└── README.md                # This file
```

## Requirements

- Node.js 18+ 
- Docker Engine 20.10+
- Linux, macOS, or Windows with WSL2
- Docker socket access or TCP connection

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our GitHub repository.

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/OnTheDock/issues)
- **Documentation**: Full API documentation in source code

## Acknowledgments

Built with the following technologies:
- [Dockerode](https://github.com/apocas/dockerode) - Docker Remote API client
- [Socket.IO](https://socket.io/) - Real-time bidirectional communication
- [Express](https://expressjs.com/) - Fast, unopinionated web framework
- [xterm.js](https://xtermjs.org/) - Terminal emulator for the web
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

---

**OnTheDock** - Simplifying Docker management, one container at a time 🚢