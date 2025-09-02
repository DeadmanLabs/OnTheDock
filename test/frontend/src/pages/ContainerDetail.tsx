import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../services/api';
import toast from 'react-hot-toast';
import LogsPanel from '../components/LogsPanel';
import StatsPanel from '../components/StatsPanel';
import TerminalPanel from '../components/TerminalPanel';
import FilesPanel from '../components/FilesPanel';
import {
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  TrashIcon,
  PauseIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

const ContainerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [container, setContainer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'logs' | 'stats' | 'terminal' | 'files'>('info');

  useEffect(() => {
    if (id) {
      loadContainer();
    }
  }, [id]);

  const loadContainer = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const data = await api.getContainer(id);
      setContainer(data);
    } catch (error) {
      toast.error('Failed to load container details');
      navigate('/containers');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!id) return;
    try {
      await api.startContainer(id);
      toast.success('Container started');
      await loadContainer();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to start container');
    }
  };

  const handleStop = async () => {
    if (!id) return;
    try {
      await api.stopContainer(id);
      toast.success('Container stopped');
      await loadContainer();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to stop container');
    }
  };

  const handleRestart = async () => {
    if (!id) return;
    try {
      await api.restartContainer(id);
      toast.success('Container restarted');
      await loadContainer();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to restart container');
    }
  };

  const handlePause = async () => {
    if (!id) return;
    try {
      await api.pauseContainer(id);
      toast.success('Container paused');
      await loadContainer();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to pause container');
    }
  };

  const handleUnpause = async () => {
    if (!id) return;
    try {
      await api.unpauseContainer(id);
      toast.success('Container unpaused');
      await loadContainer();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to unpause container');
    }
  };

  const handleRemove = async () => {
    if (!id) return;
    if (!confirm(`Are you sure you want to remove this container?`)) return;
    
    try {
      await api.removeContainer(id, true);
      toast.success('Container removed');
      navigate('/containers');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to remove container');
    }
  };

  if (loading || !container) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-docker-blue"></div>
      </div>
    );
  }

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'running':
        return 'bg-green-500';
      case 'paused':
        return 'bg-yellow-500';
      case 'exited':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/containers')}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {container.Name?.replace(/^\//, '') || container.Id.substring(0, 12)}
            </h1>
            <div className="flex items-center mt-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(container.State.Status)}`} />
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                {container.State.Status}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {container.State.Status === 'running' ? (
            <>
              <button onClick={handlePause} className="btn-secondary">
                <PauseIcon className="w-5 h-5" />
              </button>
              <button onClick={handleStop} className="btn-danger">
                <StopIcon className="w-5 h-5" />
              </button>
            </>
          ) : container.State.Status === 'paused' ? (
            <button onClick={handleUnpause} className="btn-primary">
              <PlayIcon className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={handleStart} className="btn-primary">
              <PlayIcon className="w-5 h-5" />
            </button>
          )}
          
          <button onClick={handleRestart} className="btn-secondary">
            <ArrowPathIcon className="w-5 h-5" />
          </button>
          
          <button onClick={handleRemove} className="btn-danger">
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {['info', 'logs', 'stats', 'terminal', 'files'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-docker-blue text-docker-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Container Information</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-600 dark:text-gray-400">ID</dt>
                  <dd className="font-mono text-sm">{container.Id.substring(0, 12)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Image</dt>
                  <dd className="text-sm">{container.Config.Image}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Created</dt>
                  <dd className="text-sm">{new Date(container.Created).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Started</dt>
                  <dd className="text-sm">
                    {container.State.StartedAt ? new Date(container.State.StartedAt).toLocaleString() : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Command</dt>
                  <dd className="font-mono text-sm">{container.Config.Cmd?.join(' ') || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Entrypoint</dt>
                  <dd className="font-mono text-sm">{container.Config.Entrypoint?.join(' ') || '-'}</dd>
                </div>
              </dl>
            </div>

            {container.Config.Env && container.Config.Env.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Environment Variables</h3>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <pre className="text-xs font-mono overflow-x-auto">
                    {container.Config.Env.join('\n')}
                  </pre>
                </div>
              </div>
            )}

            {container.NetworkSettings?.Ports && Object.keys(container.NetworkSettings.Ports).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Port Mappings</h3>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-sm text-gray-600 dark:text-gray-400">Container Port</th>
                      <th className="text-left text-sm text-gray-600 dark:text-gray-400">Host Port</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(container.NetworkSettings.Ports).map(([containerPort, hostPorts]: [string, any]) => (
                      <tr key={containerPort}>
                        <td className="py-2 text-sm">{containerPort}</td>
                        <td className="py-2 text-sm">
                          {hostPorts && hostPorts.length > 0
                            ? hostPorts.map((hp: any) => `${hp.HostIp}:${hp.HostPort}`).join(', ')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {container.Mounts && container.Mounts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Mounts</h3>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-sm text-gray-600 dark:text-gray-400">Type</th>
                      <th className="text-left text-sm text-gray-600 dark:text-gray-400">Source</th>
                      <th className="text-left text-sm text-gray-600 dark:text-gray-400">Destination</th>
                      <th className="text-left text-sm text-gray-600 dark:text-gray-400">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {container.Mounts.map((mount: any, index: number) => (
                      <tr key={index}>
                        <td className="py-2 text-sm">{mount.Type}</td>
                        <td className="py-2 text-sm font-mono text-xs">{mount.Source}</td>
                        <td className="py-2 text-sm font-mono text-xs">{mount.Destination}</td>
                        <td className="py-2 text-sm">{mount.RW ? 'rw' : 'ro'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && id && (
          <LogsPanel containerId={id} />
        )}

        {activeTab === 'stats' && id && container.State.Status === 'running' && (
          <StatsPanel containerId={id} />
        )}

        {activeTab === 'terminal' && id && container.State.Status === 'running' && (
          <TerminalPanel containerId={id} />
        )}

        {activeTab === 'files' && id && (
          <FilesPanel containerId={id} />
        )}
      </div>
    </div>
  );
};

export default ContainerDetail;