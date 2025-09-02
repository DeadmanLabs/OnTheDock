import { z } from 'zod';

export class InputValidator {
  private static readonly SAFE_PATH_REGEX = /^[a-zA-Z0-9/_\-\.]+$/;
  private static readonly SAFE_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*$/;
  private static readonly MAX_PATH_LENGTH = 4096;
  private static readonly MAX_NAME_LENGTH = 255;
  private static readonly MAX_COMMAND_LENGTH = 10000;
  private static readonly DANGEROUS_PATHS = [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '/root/.ssh',
    '/home/*/.ssh',
    '/var/run/docker.sock',
    '/proc',
    '/sys',
    '/dev'
  ];

  static validateContainerName(name: string): string {
    if (!name) return name;
    
    if (name.length > this.MAX_NAME_LENGTH) {
      throw new Error(`Container name exceeds maximum length of ${this.MAX_NAME_LENGTH}`);
    }

    if (!this.SAFE_NAME_REGEX.test(name)) {
      throw new Error('Container name contains invalid characters');
    }

    return name;
  }

  static validateImageName(image: string): string {
    const imageSchema = z.string()
      .min(1)
      .max(255)
      .regex(/^[a-z0-9]+(?:[._\-\/][a-z0-9]+)*(?::[a-z0-9]+(?:[._\-][a-z0-9]+)*)?$/i);

    try {
      return imageSchema.parse(image);
    } catch {
      throw new Error('Invalid image name format');
    }
  }

  static validatePath(path: string): string {
    if (!path) {
      throw new Error('Path cannot be empty');
    }

    if (path.length > this.MAX_PATH_LENGTH) {
      throw new Error(`Path exceeds maximum length of ${this.MAX_PATH_LENGTH}`);
    }

    // Prevent path traversal
    if (path.includes('..')) {
      throw new Error('Path traversal detected');
    }

    // Check against dangerous paths
    for (const dangerous of this.DANGEROUS_PATHS) {
      if (path.startsWith(dangerous.replace('/*', ''))) {
        throw new Error(`Access to ${dangerous} is restricted`);
      }
    }

    // Ensure path starts with /
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    return path;
  }

  static validateCommand(command: string | string[]): string[] {
    const commands = Array.isArray(command) ? command : [command];
    
    for (const cmd of commands) {
      if (cmd.length > this.MAX_COMMAND_LENGTH) {
        throw new Error(`Command exceeds maximum length of ${this.MAX_COMMAND_LENGTH}`);
      }

      // Check for command injection patterns
      const dangerousPatterns = [
        /;\s*rm\s+-rf/,
        /;\s*curl\s+.*\s*\|\s*bash/,
        /;\s*wget\s+.*\s*\|\s*sh/,
        /`[^`]*`/,
        /\$\([^)]*\)/,
        /&&\s*rm\s+-rf/
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(cmd)) {
          throw new Error('Potentially dangerous command detected');
        }
      }
    }

    return commands;
  }

  static validateEnvironmentVariables(env: Record<string, string> | string[]): string[] {
    const envArray = Array.isArray(env) 
      ? env 
      : Object.entries(env).map(([k, v]) => `${k}=${v}`);

    const envSchema = z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*=.*$/));

    try {
      return envSchema.parse(envArray);
    } catch {
      throw new Error('Invalid environment variable format');
    }
  }

  static validatePortMapping(port: string | number): number {
    const portNum = typeof port === 'string' ? parseInt(port, 10) : port;

    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error('Port must be between 1 and 65535');
    }

    // Prevent binding to privileged ports without explicit permission
    if (portNum < 1024) {
      console.warn(`Warning: Binding to privileged port ${portNum}`);
    }

    return portNum;
  }

  static validateVolumeMount(mount: string): string {
    const parts = mount.split(':');
    
    if (parts.length < 2 || parts.length > 3) {
      throw new Error('Invalid volume mount format');
    }

    const [hostPath, containerPath, mode] = parts;

    // Validate host path doesn't access sensitive locations
    if (!hostPath.startsWith('/var/lib/docker/volumes/')) {
      for (const dangerous of this.DANGEROUS_PATHS) {
        if (hostPath.startsWith(dangerous.replace('/*', ''))) {
          throw new Error(`Mounting ${dangerous} is not allowed`);
        }
      }
    }

    // Validate container path
    this.validatePath(containerPath);

    // Validate mode if present
    if (mode && !['ro', 'rw', 'z', 'Z'].includes(mode)) {
      throw new Error('Invalid volume mount mode');
    }

    return mount;
  }

  static validateMemoryLimit(memory: string | number): number {
    const memoryValue = typeof memory === 'string' 
      ? parseInt(memory, 10) 
      : memory;

    if (isNaN(memoryValue) || memoryValue < 4194304) { // 4MB minimum
      throw new Error('Memory limit must be at least 4MB');
    }

    if (memoryValue > 137438953472) { // 128GB maximum
      throw new Error('Memory limit exceeds maximum of 128GB');
    }

    return memoryValue;
  }

  static validateCpuLimit(cpu: string | number): number {
    const cpuValue = typeof cpu === 'string' 
      ? parseFloat(cpu) 
      : cpu;

    if (isNaN(cpuValue) || cpuValue <= 0) {
      throw new Error('CPU limit must be greater than 0');
    }

    if (cpuValue > 256) { // Reasonable maximum
      throw new Error('CPU limit exceeds maximum of 256 cores');
    }

    return cpuValue;
  }

  static sanitizeLogOutput(output: string): string {
    // Remove ANSI escape codes
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    let sanitized = output.replace(ansiRegex, '');

    // Limit output length
    const maxLength = 1000000; // 1MB
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '\n... (truncated)';
    }

    return sanitized;
  }

  static validateDockerfile(content: string): string {
    const lines = content.split('\n');
    const maxLines = 1000;
    const maxLineLength = 10000;

    if (lines.length > maxLines) {
      throw new Error(`Dockerfile exceeds maximum of ${maxLines} lines`);
    }

    for (const line of lines) {
      if (line.length > maxLineLength) {
        throw new Error(`Dockerfile line exceeds maximum length of ${maxLineLength}`);
      }

      // Check for dangerous instructions
      const trimmed = line.trim().toUpperCase();
      if (trimmed.startsWith('ADD') && trimmed.includes('HTTP')) {
        console.warn('Warning: ADD with HTTP URL detected in Dockerfile');
      }
      if (trimmed.includes('--PRIVILEGED')) {
        throw new Error('Privileged mode not allowed in Dockerfile');
      }
    }

    return content;
  }

  static validateTarballSize(size: number): void {
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
    if (size > maxSize) {
      throw new Error('File size exceeds maximum allowed size of 10GB');
    }
  }

  static escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };
    return text.replace(/[&<>"'/]/g, char => map[char]);
  }
}