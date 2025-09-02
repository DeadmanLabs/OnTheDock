import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import * as api from '../services/api';
import { LogEntry } from '../types/docker';
import { ArrowDownIcon, FunnelIcon } from '@heroicons/react/24/outline';

interface LogsPanelProps {
  containerId: string;
}

const LogsPanel: React.FC<LogsPanelProps> = ({ containerId }) => {
  const { socket } = useSocket();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [streamType, setStreamType] = useState<'all' | 'stdout' | 'stderr'>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load initial logs
    loadLogs();

    // Start streaming
    if (socket) {
      socket.emit('logs:follow', {
        containerId,
        options: {
          stdout: true,
          stderr: true,
          timestamps: true,
          tail: 100
        }
      }, (response: any) => {
        if (!response.success) {
          console.error('Failed to start log stream:', response.error);
        }
      });

      socket.on('logs:entry', handleLogEntry);

      return () => {
        socket.emit('logs:stop', containerId, () => {});
        socket.off('logs:entry', handleLogEntry);
      };
    }
  }, [containerId, socket]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const loadLogs = async () => {
    try {
      const entries = await api.tailContainerLogs(containerId, 100);
      setLogs(entries);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const handleLogEntry = (data: { containerId: string; entry: LogEntry }) => {
    if (data.containerId === containerId) {
      setLogs(prev => [...prev, data.entry]);
    }
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isAtBottom);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = () => {
    const content = logs.map(log => 
      `${showTimestamps ? new Date(log.timestamp).toISOString() + ' ' : ''}[${log.stream}] ${log.line}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${containerId}_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => {
    if (streamType !== 'all' && log.stream !== streamType) return false;
    if (filter && !log.line.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const getStreamColor = (stream: string) => {
    return stream === 'stderr' ? 'text-red-400' : 'text-gray-100';
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <FunnelIcon className="w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input w-64"
            />
          </div>
          
          <select
            value={streamType}
            onChange={(e) => setStreamType(e.target.value as any)}
            className="input w-32"
          >
            <option value="all">All</option>
            <option value="stdout">Stdout</option>
            <option value="stderr">Stderr</option>
          </select>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showTimestamps}
              onChange={(e) => setShowTimestamps(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Timestamps</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Auto-scroll</span>
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={clearLogs}
            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Clear
          </button>
          <button
            onClick={downloadLogs}
            className="px-3 py-1 text-sm bg-docker-blue text-white rounded hover:bg-blue-600"
          >
            Download
          </button>
        </div>
      </div>

      {/* Logs Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-gray-900 rounded-lg p-4 overflow-y-auto font-mono text-sm"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No logs to display
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log, index) => (
              <div key={index} className="flex">
                {showTimestamps && (
                  <span className="text-gray-500 mr-3 flex-shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded mr-2 flex-shrink-0 ${
                  log.stream === 'stderr' ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-300'
                }`}>
                  {log.stream}
                </span>
                <span className={`break-all ${getStreamColor(log.stream)}`}>
                  {log.line}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>{filteredLogs.length} lines</span>
        {autoScroll && (
          <span className="flex items-center">
            <ArrowDownIcon className="w-4 h-4 mr-1" />
            Auto-scrolling
          </span>
        )}
      </div>
    </div>
  );
};

export default LogsPanel;