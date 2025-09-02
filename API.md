# OnTheDock API Documentation

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [Constructor](#constructor)
  - [Containers](#containers)
  - [Images](#images)
  - [Logs](#logs)
  - [Stats](#stats)
  - [Exec](#exec)
  - [Files](#files)
  - [System](#system)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Installation

```bash
npm install @org/docker-control
```

## Quick Start

```javascript
const { DockerControl } = require('@org/docker-control');

// Initialize with default Unix socket
const docker = new DockerControl();

// Or specify custom connection
const docker = new DockerControl({
  socketPath: '/var/run/docker.sock',  // Unix socket (default)
  // or
  host: 'localhost',                    // TCP connection
  port: 2375
});

// Use the API
const containers = await docker.containers.list();
console.log(`Found ${containers.length} containers`);
```

## API Reference

### Constructor

#### `new DockerControl(options?)`

Creates a new DockerControl instance.

**Parameters:**
- `options` (optional): Docker connection options
  - `socketPath`: Path to Docker Unix socket (default: `/var/run/docker.sock`)
  - `host`: Docker daemon host for TCP connection
  - `port`: Docker daemon port for TCP connection
  - `ca`: CA certificate
  - `cert`: Client certificate
  - `key`: Client key

**Returns:** `DockerControl` instance

**Example:**
```javascript
// Default Unix socket
const docker = new DockerControl();

// Custom Unix socket
const docker = new DockerControl({ 
  socketPath: '/custom/docker.sock' 
});

// TCP connection
const docker = new DockerControl({ 
  host: '192.168.1.100', 
  port: 2375 
});

// TLS connection
const docker = new DockerControl({
  host: 'docker.example.com',
  port: 2376,
  ca: fs.readFileSync('ca.pem'),
  cert: fs.readFileSync('cert.pem'),
  key: fs.readFileSync('key.pem')
});
```

---

### Containers

#### `docker.containers.list(all?)`

Lists all containers.

**Parameters:**
- `all` (boolean, default: `true`): Show all containers (including stopped)

**Returns:** `Promise<Container[]>`

**Container Object:**
```typescript
{
  id: string;           // Container ID
  name: string;         // Container name
  image: string;        // Image name
  state: string;        // running, exited, paused, etc.
  status: string;       // Human-readable status
  created: number;      // Creation timestamp
  ports: Port[];        // Port mappings
}
```

**Example:**
```javascript
// List all containers
const allContainers = await docker.containers.list();

// List only running containers
const runningContainers = await docker.containers.list(false);

console.log(`Total: ${allContainers.length}, Running: ${runningContainers.length}`);
```

#### `docker.containers.get(id)`

Gets detailed information about a specific container.

**Parameters:**
- `id` (string): Container ID or name

**Returns:** `Promise<ContainerInfo>`

**Example:**
```javascript
const info = await docker.containers.get('my-container');
console.log(`Container ${info.name} is ${info.state.Status}`);
```

#### `docker.containers.create(options)`

Creates a new container.

**Parameters:**
- `options` (object):
  - `image` (string, required): Image name
  - `name` (string): Container name
  - `ports` (string[]): Port mappings (e.g., `["8080:80", "3000:3000"]`)
  - `env` (object): Environment variables
  - `volumes` (string[]): Volume mappings (e.g., `["/host:/container"]`)
  - `cmd` (string[]): Command to run

**Returns:** `Promise<string>` - Container ID

**Example:**
```javascript
const containerId = await docker.containers.create({
  image: 'nginx:latest',
  name: 'my-nginx',
  ports: ['8080:80'],
  env: {
    NODE_ENV: 'production',
    API_KEY: 'secret'
  },
  volumes: ['/data:/usr/share/nginx/html'],
  cmd: ['nginx', '-g', 'daemon off;']
});

console.log(`Created container: ${containerId}`);
```

#### `docker.containers.start(id)`

Starts a container.

**Parameters:**
- `id` (string): Container ID or name

**Returns:** `Promise<{success: boolean}>`

**Example:**
```javascript
await docker.containers.start('my-container');
console.log('Container started');
```

#### `docker.containers.stop(id)`

Stops a container.

**Parameters:**
- `id` (string): Container ID or name

**Returns:** `Promise<{success: boolean}>`

**Example:**
```javascript
await docker.containers.stop('my-container');
console.log('Container stopped');
```

#### `docker.containers.restart(id)`

Restarts a container.

**Parameters:**
- `id` (string): Container ID or name

**Returns:** `Promise<{success: boolean}>`

**Example:**
```javascript
await docker.containers.restart('my-container');
console.log('Container restarted');
```

#### `docker.containers.remove(id, force?)`

Removes a container.

**Parameters:**
- `id` (string): Container ID or name
- `force` (boolean, default: `false`): Force removal of running container

**Returns:** `Promise<{success: boolean}>`

**Example:**
```javascript
// Remove stopped container
await docker.containers.remove('my-container');

// Force remove running container
await docker.containers.remove('my-container', true);
```

---

### Images

#### `docker.images.list()`

Lists all images.

**Returns:** `Promise<Image[]>`

**Image Object:**
```typescript
{
  id: string;          // Image ID
  tags: string[];      // Image tags
  size: number;        // Size in bytes
  created: number;     // Creation timestamp
}
```

**Example:**
```javascript
const images = await docker.images.list();
images.forEach(image => {
  console.log(`${image.tags[0] || 'untagged'}: ${(image.size / 1024 / 1024).toFixed(2)} MB`);
});
```

#### `docker.images.pull(image, onProgress?)`

Pulls an image from a registry.

**Parameters:**
- `image` (string): Image name (e.g., `ubuntu:latest`)
- `onProgress` (function, optional): Progress callback

**Returns:** `Promise<void>`

**Example:**
```javascript
// Simple pull
await docker.images.pull('alpine:latest');

// With progress tracking
await docker.images.pull('ubuntu:22.04', (event) => {
  if (event.status === 'Downloading') {
    console.log(`${event.id}: ${event.progress}`);
  } else {
    console.log(`${event.status}: ${event.id || ''}`);
  }
});
```

#### `docker.images.remove(id, force?)`

Removes an image.

**Parameters:**
- `id` (string): Image ID or tag
- `force` (boolean, default: `false`): Force removal

**Returns:** `Promise<{success: boolean}>`

**Example:**
```javascript
await docker.images.remove('ubuntu:22.04');
```

---

### Logs

#### `docker.logs.get(id, options?)`

Gets container logs.

**Parameters:**
- `id` (string): Container ID or name
- `options` (object):
  - `tail` (number, default: 100): Number of lines to return
  - `timestamps` (boolean, default: false): Include timestamps

**Returns:** `Promise<string>` - Log content

**Example:**
```javascript
// Get last 100 lines
const logs = await docker.logs.get('my-container');
console.log(logs);

// Get last 50 lines with timestamps
const logs = await docker.logs.get('my-container', {
  tail: 50,
  timestamps: true
});
```

#### `docker.logs.stream(id, onData, options?)`

Streams container logs in real-time.

**Parameters:**
- `id` (string): Container ID or name
- `onData` (function): Callback for log data
- `options` (object):
  - `tail` (number, default: 100): Number of initial lines

**Returns:** `Promise<Stream>` - Log stream

**Example:**
```javascript
const stream = await docker.logs.stream('my-container', (data) => {
  console.log('Log:', data);
}, { tail: 10 });

// Stop streaming later
stream.destroy();
```

---

### Stats

#### `docker.stats.get(id)`

Gets container statistics snapshot.

**Parameters:**
- `id` (string): Container ID or name

**Returns:** `Promise<Stats>`

**Stats Object:**
```typescript
{
  cpu: {
    percent: string;    // CPU usage percentage
  },
  memory: {
    usage: number;      // Memory usage in bytes
    limit: number;      // Memory limit in bytes
    percent: string;    // Memory usage percentage
  },
  network: {
    rx: number;         // Bytes received
    tx: number;         // Bytes transmitted
  }
}
```

**Example:**
```javascript
const stats = await docker.stats.get('my-container');
console.log(`CPU: ${stats.cpu.percent}%`);
console.log(`Memory: ${stats.memory.percent}% (${stats.memory.usage} / ${stats.memory.limit})`);
console.log(`Network RX: ${stats.network.rx}, TX: ${stats.network.tx}`);
```

#### `docker.stats.stream(id, onData)`

Streams container statistics in real-time.

**Parameters:**
- `id` (string): Container ID or name
- `onData` (function): Callback for stats data

**Returns:** `Promise<Stream>` - Stats stream

**Example:**
```javascript
const stream = await docker.stats.stream('my-container', (stats) => {
  console.log(`CPU: ${stats.cpu.percent}%, Memory: ${stats.memory.percent}%`);
});

// Stop streaming later
stream.destroy();
```

---

### Exec

#### `docker.exec.create(id, options)`

Creates an exec instance in a container.

**Parameters:**
- `id` (string): Container ID or name
- `options` (object):
  - `cmd` (string[], required): Command to execute
  - `attachStdin` (boolean): Attach stdin
  - `attachStdout` (boolean): Attach stdout
  - `attachStderr` (boolean): Attach stderr
  - `tty` (boolean): Allocate a TTY
  - `workingDir` (string): Working directory
  - `env` (string[]): Environment variables

**Returns:** `Promise<string>` - Exec ID

**Example:**
```javascript
const execId = await docker.exec.create('my-container', {
  cmd: ['ls', '-la', '/app'],
  attachStdout: true,
  attachStderr: true
});
```

#### `docker.exec.start(execId, options?)`

Starts an exec instance.

**Parameters:**
- `execId` (string): Exec ID
- `options` (object):
  - `hijack` (boolean): Use hijacked connection for stdin
  - `stdin` (boolean): Attach stdin

**Returns:** `Promise<Stream>` - Exec stream

**Example:**
```javascript
// Simple command execution
const execId = await docker.exec.create('my-container', {
  cmd: ['echo', 'Hello World'],
  attachStdout: true
});

const stream = await docker.exec.start(execId);
stream.on('data', (chunk) => {
  console.log(chunk.toString());
});

// Interactive shell
const execId = await docker.exec.create('my-container', {
  cmd: ['/bin/bash'],
  attachStdin: true,
  attachStdout: true,
  attachStderr: true,
  tty: true
});

const stream = await docker.exec.start(execId, {
  hijack: true,
  stdin: true
});

// Send commands
stream.write('ls -la\n');
stream.write('exit\n');
```

#### `docker.exec.resize(execId, dimensions)`

Resizes the TTY of an exec instance.

**Parameters:**
- `execId` (string): Exec ID
- `dimensions` (object):
  - `h` (number): Height in rows
  - `w` (number): Width in columns

**Returns:** `Promise<{success: boolean}>`

**Example:**
```javascript
await docker.exec.resize(execId, { h: 24, w: 80 });
```

#### `docker.exec.findShell(id)`

Finds an available shell in a container.

**Parameters:**
- `id` (string): Container ID or name

**Returns:** `Promise<string>` - Path to shell

**Description:**
Automatically detects and returns the first available shell from:
- `/bin/bash`
- `/bin/sh`
- `/bin/ash`
- `sh`

**Example:**
```javascript
const shell = await docker.exec.findShell('my-container');
console.log(`Found shell: ${shell}`);

// Use it to create an interactive session
const execId = await docker.exec.create('my-container', {
  cmd: [shell],
  attachStdin: true,
  attachStdout: true,
  attachStderr: true,
  tty: true
});
```

---

### Files

#### `docker.files.list(id, path)`

Lists files in a container directory.

**Parameters:**
- `id` (string): Container ID or name
- `path` (string): Directory path

**Returns:** `Promise<{path: string, files: File[]}>`

**File Object:**
```typescript
{
  name: string;         // File name
  size: number;         // Size in bytes
  isDirectory: boolean; // Is directory
  permissions: string;  // Unix permissions
  path: string;         // Full path
}
```

**Example:**
```javascript
const result = await docker.files.list('my-container', '/app');
console.log(`Files in ${result.path}:`);
result.files.forEach(file => {
  const type = file.isDirectory ? 'DIR' : 'FILE';
  console.log(`  ${type}: ${file.name} (${file.size} bytes)`);
});
```

#### `docker.files.download(id, path)`

Downloads a file from a container.

**Parameters:**
- `id` (string): Container ID or name
- `path` (string): File path

**Returns:** `Promise<string>` - File content

**Example:**
```javascript
const content = await docker.files.download('my-container', '/etc/nginx/nginx.conf');
console.log('File content:', content);

// Save to local file
const fs = require('fs');
fs.writeFileSync('nginx.conf', content);
```

#### `docker.files.upload(id, path, filename, content)`

Uploads a file to a container.

**Parameters:**
- `id` (string): Container ID or name
- `path` (string): Destination directory
- `filename` (string): File name
- `content` (Buffer): File content

**Returns:** `Promise<{success: boolean, path: string}>`

**Example:**
```javascript
const content = Buffer.from('Hello from host!');
const result = await docker.files.upload(
  'my-container',
  '/app',
  'message.txt',
  content
);
console.log(`File uploaded to: ${result.path}`);

// Upload existing file
const fs = require('fs');
const fileContent = fs.readFileSync('config.json');
await docker.files.upload('my-container', '/app', 'config.json', fileContent);
```

---

### System

#### `docker.system.info()`

Gets Docker system information.

**Returns:** `Promise<SystemInfo>`

**SystemInfo Object:**
```typescript
{
  containers: number;          // Total containers
  containersRunning: number;   // Running containers
  images: number;              // Total images
  serverVersion: string;       // Docker version
  apiVersion: string;          // API version
  os: string;                  // Operating system
  kernelVersion: string;       // Kernel version
  memTotal: number;            // Total memory in bytes
  cpus: number;                // Number of CPUs
}
```

**Example:**
```javascript
const info = await docker.system.info();
console.log(`Docker ${info.serverVersion} on ${info.os}`);
console.log(`Resources: ${info.cpus} CPUs, ${info.memTotal / 1024 / 1024 / 1024} GB RAM`);
console.log(`Containers: ${info.containersRunning}/${info.containers} running`);
```

#### `docker.system.ping()`

Pings the Docker daemon.

**Returns:** `Promise<{success: boolean}>`

**Example:**
```javascript
try {
  await docker.system.ping();
  console.log('Docker daemon is responsive');
} catch (error) {
  console.error('Docker daemon is not responding');
}
```

---

## Error Handling

All methods return promises that may reject with errors. Always use try-catch or .catch():

```javascript
// Using async/await
try {
  const containers = await docker.containers.list();
  console.log(`Found ${containers.length} containers`);
} catch (error) {
  console.error('Failed to list containers:', error.message);
}

// Using promises
docker.containers.list()
  .then(containers => {
    console.log(`Found ${containers.length} containers`);
  })
  .catch(error => {
    console.error('Failed to list containers:', error.message);
  });
```

Common error scenarios:
- Docker daemon not running
- Insufficient permissions
- Container/image not found
- Network timeouts
- Invalid parameters

---

## Examples

### Complete Container Lifecycle

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function containerLifecycle() {
  // Create container
  const containerId = await docker.containers.create({
    image: 'nginx:alpine',
    name: 'my-web-server',
    ports: ['8080:80']
  });
  console.log(`Created: ${containerId}`);
  
  // Start container
  await docker.containers.start(containerId);
  console.log('Started');
  
  // Get logs
  const logs = await docker.logs.get(containerId);
  console.log('Logs:', logs);
  
  // Get stats
  const stats = await docker.stats.get(containerId);
  console.log(`CPU: ${stats.cpu.percent}%, Memory: ${stats.memory.percent}%`);
  
  // Stop container
  await docker.containers.stop(containerId);
  console.log('Stopped');
  
  // Remove container
  await docker.containers.remove(containerId);
  console.log('Removed');
}

containerLifecycle().catch(console.error);
```

### Real-time Monitoring

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function monitor(containerId) {
  // Stream logs
  const logStream = await docker.logs.stream(containerId, (data) => {
    console.log('[LOG]', data.trim());
  });
  
  // Stream stats
  const statsStream = await docker.stats.stream(containerId, (stats) => {
    console.log(`[STATS] CPU: ${stats.cpu.percent}%, Memory: ${stats.memory.percent}%`);
  });
  
  // Stop after 30 seconds
  setTimeout(() => {
    logStream.destroy();
    statsStream.destroy();
    console.log('Monitoring stopped');
  }, 30000);
}

monitor('my-container').catch(console.error);
```

### Interactive Terminal Session

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function interactiveShell(containerId) {
  // Find available shell
  const shell = await docker.exec.findShell(containerId);
  console.log(`Using shell: ${shell}`);
  
  // Create exec instance
  const execId = await docker.exec.create(containerId, {
    cmd: [shell],
    attachStdin: true,
    attachStdout: true,
    attachStderr: true,
    tty: true
  });
  
  // Start interactive session
  const stream = await docker.exec.start(execId, {
    hijack: true,
    stdin: true
  });
  
  // Connect stdin/stdout
  process.stdin.pipe(stream);
  stream.pipe(process.stdout);
  
  // Handle exit
  stream.on('end', () => {
    process.exit(0);
  });
}

interactiveShell('my-container').catch(console.error);
```

### File Operations

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();
const fs = require('fs');

async function fileOperations(containerId) {
  // List files
  const result = await docker.files.list(containerId, '/etc');
  console.log(`Files in /etc: ${result.files.length}`);
  
  // Download file
  const content = await docker.files.download(containerId, '/etc/hostname');
  console.log('Hostname:', content.trim());
  
  // Upload file
  const newContent = Buffer.from(`# Generated at ${new Date()}\nHello World!`);
  await docker.files.upload(containerId, '/tmp', 'greeting.txt', newContent);
  console.log('File uploaded');
  
  // Verify upload
  const uploaded = await docker.files.download(containerId, '/tmp/greeting.txt');
  console.log('Uploaded content:', uploaded);
}

fileOperations('my-container').catch(console.error);
```

### Working with Images

```javascript
const { DockerControl } = require('@org/docker-control');
const docker = new DockerControl();

async function imageOperations() {
  // List current images
  const imagesBefore = await docker.images.list();
  console.log(`Current images: ${imagesBefore.length}`);
  
  // Pull new image with progress
  console.log('Pulling alpine:latest...');
  await docker.images.pull('alpine:latest', (event) => {
    if (event.status === 'Downloading') {
      process.stdout.write(`\r${event.id}: ${event.progress || ''}`);
    } else if (event.status === 'Pull complete') {
      process.stdout.write(`\r${event.id}: ✓ Complete\n`);
    }
  });
  
  // List images again
  const imagesAfter = await docker.images.list();
  console.log(`\nImages after pull: ${imagesAfter.length}`);
  
  // Find alpine image
  const alpine = imagesAfter.find(img => 
    img.tags.some(tag => tag.includes('alpine'))
  );
  
  if (alpine) {
    console.log(`Alpine image: ${alpine.tags[0]}, Size: ${(alpine.size / 1024 / 1024).toFixed(2)} MB`);
  }
}

imageOperations().catch(console.error);
```