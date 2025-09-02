import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  containerId: string;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ containerId }) => {
  const { socket } = useSocket();
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [execId, setExecId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [command, setCommand] = useState('/bin/bash');
  const [customCommand, setCustomCommand] = useState('');
  const [showCommandInput, setShowCommandInput] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || !socket) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#1a1a1a',
        red: '#f87171',
        green: '#a3e635',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#67e8f9',
        white: '#d4d4d4',
        brightBlack: '#525252',
        brightRed: '#ef4444',
        brightGreen: '#84cc16',
        brightYellow: '#f59e0b',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#f5f5f5'
      },
      allowTransparency: true,
      windowsMode: false,
      convertEol: true
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    setTerminal(term);

    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [socket]);

  useEffect(() => {
    if (!terminal || !socket || connected) return;

    const connect = () => {
      socket.emit('exec:create', {
        containerId,
        command,
        tty: true,
        attachStdin: true,
        attachStdout: true,
        attachStderr: true,
        env: [],
        workingDir: '/'
      }, (response: any) => {
        if (response.success) {
          setExecId(response.execId);
          setConnected(true);
          terminal.writeln('\x1b[32mConnected to container\x1b[0m');
          terminal.writeln('');
        } else {
          terminal.writeln(`\x1b[31mFailed to connect: ${response.error}\x1b[0m`);
        }
      });
    };

    if (command) {
      connect();
    }
  }, [terminal, socket, containerId, command, connected]);

  useEffect(() => {
    if (!terminal || !socket || !execId) return;

    const handleData = (data: { execId: string; data: string }) => {
      if (data.execId === execId) {
        terminal.write(data.data);
      }
    };

    const handleExit = (data: { execId: string; exitCode: number }) => {
      if (data.execId === execId) {
        terminal.writeln('');
        terminal.writeln(`\x1b[33mProcess exited with code ${data.exitCode}\x1b[0m`);
        setConnected(false);
        setExecId(null);
      }
    };

    const handleError = (data: { execId: string; error: string }) => {
      if (data.execId === execId) {
        terminal.writeln(`\x1b[31mError: ${data.error}\x1b[0m`);
      }
    };

    socket.on('exec:data', handleData);
    socket.on('exec:exit', handleExit);
    socket.on('exec:error', handleError);

    const onTerminalData = terminal.onData((data: string) => {
      if (execId) {
        socket.emit('exec:input', { execId, data });
      }
    });

    const onTerminalResize = terminal.onResize((size: { cols: number; rows: number }) => {
      if (execId) {
        socket.emit('exec:resize', { 
          execId, 
          dimensions: { 
            width: size.cols, 
            height: size.rows 
          } 
        });
      }
    });

    return () => {
      socket.off('exec:data', handleData);
      socket.off('exec:exit', handleExit);
      socket.off('exec:error', handleError);
      onTerminalData.dispose();
      onTerminalResize.dispose();
    };
  }, [terminal, socket, execId]);

  const disconnect = () => {
    if (socket && execId) {
      socket.emit('exec:stop', execId, () => {
        setConnected(false);
        setExecId(null);
        if (terminal) {
          terminal.clear();
        }
      });
    }
  };

  const reconnect = () => {
    disconnect();
    setTimeout(() => {
      setConnected(false);
      setExecId(null);
    }, 100);
  };

  const executeCommand = () => {
    if (customCommand.trim()) {
      setCommand(customCommand.trim());
      setCustomCommand('');
      setShowCommandInput(false);
      reconnect();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <select
            value={command}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setShowCommandInput(true);
              } else {
                setCommand(e.target.value);
                reconnect();
              }
            }}
            className="input w-48"
            disabled={connected}
          >
            <option value="/bin/bash">Bash</option>
            <option value="/bin/sh">Shell</option>
            <option value="/bin/ash">Ash (Alpine)</option>
            <option value="/bin/zsh">Zsh</option>
            <option value="python">Python</option>
            <option value="node">Node.js</option>
            <option value="custom">Custom Command...</option>
          </select>

          {showCommandInput && (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && executeCommand()}
                placeholder="Enter command..."
                className="input w-64"
                autoFocus
              />
              <button
                onClick={executeCommand}
                className="btn-primary"
              >
                Execute
              </button>
              <button
                onClick={() => {
                  setShowCommandInput(false);
                  setCustomCommand('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            connected 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
              : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
          }`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          
          {connected ? (
            <button
              onClick={disconnect}
              className="btn-danger"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={reconnect}
              className="btn-primary"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg p-4 relative">
        <div 
          ref={terminalRef} 
          className="h-[500px]"
          style={{
            backgroundColor: '#1a1a1a'
          }}
        />
        
        {!connected && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="animate-pulse mb-4">
                <div className="w-16 h-16 border-4 border-docker-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
              <p className="text-gray-400">Click Connect to start a terminal session</p>
            </div>
          </div>
        )}
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        <p>Terminal session active. Use Ctrl+D or type 'exit' to close the session.</p>
        <p>Tip: You can select a different shell or enter a custom command from the dropdown.</p>
      </div>
    </div>
  );
};

export default TerminalPanel;