import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocker } from '../contexts/DockerContext';
import * as api from '../services/api';
import toast from 'react-hot-toast';
import {
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  TrashIcon,
  PauseIcon,
  PlusIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

const Containers: React.FC = () => {
  const { containers, refreshContainers } = useDocker();
  const [loading, setLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');

  const handleStart = async (id: string) => {
    setLoading(id);
    try {
      await api.startContainer(id);
      toast.success('Container started');
      await refreshContainers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to start container');
    } finally {
      setLoading(null);
    }
  };

  const handleStop = async (id: string) => {
    setLoading(id);
    try {
      await api.stopContainer(id);
      toast.success('Container stopped');
      await refreshContainers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to stop container');
    } finally {
      setLoading(null);
    }
  };

  const handleRestart = async (id: string) => {
    setLoading(id);
    try {
      await api.restartContainer(id);
      toast.success('Container restarted');
      await refreshContainers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to restart container');
    } finally {
      setLoading(null);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove container "${name}"?`)) return;
    
    setLoading(id);
    try {
      await api.removeContainer(id, true);
      toast.success('Container removed');
      await refreshContainers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to remove container');
    } finally {
      setLoading(null);
    }
  };

  const handlePause = async (id: string) => {
    setLoading(id);
    try {
      await api.pauseContainer(id);
      toast.success('Container paused');
      await refreshContainers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to pause container');
    } finally {
      setLoading(null);
    }
  };

  const handleUnpause = async (id: string) => {
    setLoading(id);
    try {
      await api.unpauseContainer(id);
      toast.success('Container unpaused');
      await refreshContainers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to unpause container');
    } finally {
      setLoading(null);
    }
  };

  const filteredContainers = containers.filter(container => {
    if (filter === 'running') return container.state === 'running';
    if (filter === 'stopped') return container.state === 'exited';
    return true;
  });

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'running':
        return 'bg-green-500';
      case 'paused':
        return 'bg-yellow-500';
      case 'exited':
        return 'bg-gray-500';
      case 'restarting':
        return 'bg-blue-500';
      case 'dead':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Containers</h1>
        <div className="flex items-center space-x-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="input"
          >
            <option value="all">All Containers</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
          </select>
          <button
            onClick={refreshContainers}
            className="btn-secondary"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
          <Link to="/containers/create" className="btn-primary flex items-center">
            <PlusIcon className="w-5 h-5 mr-2" />
            Create Container
          </Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Image
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Ports
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredContainers.map((container) => (
              <tr key={container.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(container.state)}`} />
                    <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">
                      {container.state}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    to={`/containers/${container.id}`}
                    className="text-docker-blue hover:underline font-medium"
                  >
                    {container.name}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {container.image}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {container.ports.length > 0 ? (
                    <div className="space-y-1">
                      {container.ports.map((port, index) => (
                        <div key={index} className="text-xs">
                          {port.hostPort ? `${port.hostPort}:${port.containerPort}/${port.protocol}` : `${port.containerPort}/${port.protocol}`}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {new Date(container.created).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-2">
                    <Link
                      to={`/containers/${container.id}`}
                      className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      title="View Details"
                    >
                      <EyeIcon className="w-5 h-5" />
                    </Link>
                    
                    {container.state === 'running' ? (
                      <>
                        <button
                          onClick={() => handlePause(container.id)}
                          disabled={loading === container.id}
                          className="text-yellow-600 hover:text-yellow-700"
                          title="Pause"
                        >
                          <PauseIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleStop(container.id)}
                          disabled={loading === container.id}
                          className="text-red-600 hover:text-red-700"
                          title="Stop"
                        >
                          <StopIcon className="w-5 h-5" />
                        </button>
                      </>
                    ) : container.state === 'paused' ? (
                      <button
                        onClick={() => handleUnpause(container.id)}
                        disabled={loading === container.id}
                        className="text-green-600 hover:text-green-700"
                        title="Unpause"
                      >
                        <PlayIcon className="w-5 h-5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(container.id)}
                        disabled={loading === container.id}
                        className="text-green-600 hover:text-green-700"
                        title="Start"
                      >
                        <PlayIcon className="w-5 h-5" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleRestart(container.id)}
                      disabled={loading === container.id}
                      className="text-blue-600 hover:text-blue-700"
                      title="Restart"
                    >
                      <ArrowPathIcon className="w-5 h-5" />
                    </button>
                    
                    <button
                      onClick={() => handleRemove(container.id, container.name)}
                      disabled={loading === container.id}
                      className="text-red-600 hover:text-red-700"
                      title="Remove"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredContainers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No containers found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Containers;