import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { ContainerStats } from '../types/docker';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StatsPanelProps {
  containerId: string;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ containerId }) => {
  const { socket } = useSocket();
  const [stats, setStats] = useState<ContainerStats[]>([]);
  const [maxDataPoints] = useState(60); // Keep last 60 data points

  useEffect(() => {
    if (!socket) return;

    // Start stats streaming
    socket.emit('stats:start', {
      containerId,
      interval: 1000
    }, (response: any) => {
      if (!response.success) {
        console.error('Failed to start stats stream:', response.error);
      }
    });

    socket.on('stats:data', handleStatsData);

    return () => {
      socket.emit('stats:stop', containerId, () => {});
      socket.off('stats:data', handleStatsData);
    };
  }, [containerId, socket]);

  const handleStatsData = (data: { containerId: string; stats: ContainerStats }) => {
    if (data.containerId === containerId) {
      setStats(prev => {
        const newStats = [...prev, data.stats];
        if (newStats.length > maxDataPoints) {
          return newStats.slice(-maxDataPoints);
        }
        return newStats;
      });
    }
  };

  const formatBytes = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const latestStats = stats[stats.length - 1];

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
        },
      },
      y: {
        display: true,
        min: 0,
        max: 100,
        ticks: {
          callback: function(value: any) {
            return value + '%';
          }
        }
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  };

  const cpuData = {
    labels: stats.map((_, index) => index.toString()),
    datasets: [
      {
        label: 'CPU Usage',
        data: stats.map(s => s.cpu.percent),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const memoryData = {
    labels: stats.map((_, index) => index.toString()),
    datasets: [
      {
        label: 'Memory Usage',
        data: stats.map(s => s.memory.percent),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const networkData = {
    labels: stats.map((_, index) => index.toString()),
    datasets: [
      {
        label: 'Network RX',
        data: stats.map(s => s.network.rxBytes),
        borderColor: 'rgb(251, 146, 60)',
        backgroundColor: 'rgba(251, 146, 60, 0.1)',
        fill: false,
        tension: 0.4,
      },
      {
        label: 'Network TX',
        data: stats.map(s => s.network.txBytes),
        borderColor: 'rgb(163, 230, 53)',
        backgroundColor: 'rgba(163, 230, 53, 0.1)',
        fill: false,
        tension: 0.4,
      },
    ],
  };

  const networkChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        display: true,
        ticks: {
          callback: function(value: any) {
            return formatBytes(value);
          }
        }
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Current Stats */}
      {latestStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">CPU Usage</p>
            <p className="text-2xl font-bold text-blue-600">
              {latestStats.cpu.percent.toFixed(2)}%
            </p>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Memory Usage</p>
            <p className="text-2xl font-bold text-green-600">
              {latestStats.memory.percent.toFixed(2)}%
            </p>
            <p className="text-xs text-gray-500">
              {formatBytes(latestStats.memory.usage)} / {formatBytes(latestStats.memory.limit)}
            </p>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Network I/O</p>
            <p className="text-sm font-medium">
              <span className="text-orange-600">↓ {formatBytes(latestStats.network.rxBytes)}</span>
              <span className="mx-2">/</span>
              <span className="text-lime-600">↑ {formatBytes(latestStats.network.txBytes)}</span>
            </p>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Block I/O</p>
            <p className="text-sm font-medium">
              <span className="text-purple-600">R: {formatBytes(latestStats.blockIO.readBytes)}</span>
              <span className="mx-2">/</span>
              <span className="text-pink-600">W: {formatBytes(latestStats.blockIO.writeBytes)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Charts */}
      {stats.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">CPU Usage</h3>
            <div className="h-64">
              <Line data={cpuData} options={chartOptions} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Memory Usage</h3>
            <div className="h-64">
              <Line data={memoryData} options={chartOptions} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Network I/O</h3>
            <div className="h-64">
              <Line data={networkData} options={networkChartOptions} />
            </div>
          </div>
        </div>
      )}

      {stats.length === 0 && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-docker-blue mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Waiting for stats data...</p>
        </div>
      )}
    </div>
  );
};

export default StatsPanel;