import React, { useEffect, useState } from 'react';
import { useDocker } from '../contexts/DockerContext';
import * as api from '../services/api';
import { 
  CubeIcon, 
  PhotoIcon, 
  ServerStackIcon,
  CpuChipIcon,
  CircleStackIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const Dashboard: React.FC = () => {
  const { containers, images, systemInfo, refreshContainers, refreshImages, refreshSystemInfo } = useDocker();
  const [resources, setResources] = useState<any>(null);
  const [diskUsage, setDiskUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resourcesData, diskData] = await Promise.all([
        api.getSystemResources(),
        api.getDiskUsage()
      ]);
      setResources(resourcesData);
      setDiskUsage(diskData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    await Promise.all([
      refreshContainers(),
      refreshImages(),
      refreshSystemInfo(),
      loadData()
    ]);
  };

  const formatBytes = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const runningContainers = containers.filter(c => c.state === 'running').length;
  const stoppedContainers = containers.filter(c => c.state === 'exited').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <button
          onClick={refresh}
          className="btn-primary flex items-center"
          disabled={loading}
        >
          <ArrowPathIcon className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <CubeIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Containers</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{containers.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {runningContainers} running, {stoppedContainers} stopped
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <PhotoIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Images</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{images.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {diskUsage ? formatBytes(diskUsage.layersSize) : '0 B'} total
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <CpuChipIcon className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">CPU</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {resources?.cpu.cores || 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {resources?.cpu.architecture || 'Unknown'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
              <CircleStackIcon className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Memory</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {resources ? `${Math.round(resources.memory.percentage)}%` : '0%'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {resources ? `${formatBytes(resources.memory.used)} / ${formatBytes(resources.memory.total)}` : '0 B / 0 B'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      {systemInfo && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">System Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Docker Version</p>
              <p className="font-medium text-gray-900 dark:text-white">{systemInfo.ServerVersion}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Operating System</p>
              <p className="font-medium text-gray-900 dark:text-white">{systemInfo.OperatingSystem}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Kernel Version</p>
              <p className="font-medium text-gray-900 dark:text-white">{systemInfo.KernelVersion}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Storage Driver</p>
              <p className="font-medium text-gray-900 dark:text-white">{systemInfo.Driver}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Logging Driver</p>
              <p className="font-medium text-gray-900 dark:text-white">{systemInfo.LoggingDriver}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Docker Root</p>
              <p className="font-medium text-gray-900 dark:text-white">{systemInfo.DockerRootDir}</p>
            </div>
          </div>
        </div>
      )}

      {/* Disk Usage */}
      {diskUsage && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Disk Usage</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Images</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {diskUsage.images?.length || 0} ({formatBytes(
                  diskUsage.images?.reduce((sum: number, img: any) => sum + img.size, 0) || 0
                )})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Containers</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {diskUsage.containers?.length || 0} ({formatBytes(
                  diskUsage.containers?.reduce((sum: number, c: any) => sum + c.sizeRw, 0) || 0
                )})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Volumes</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {diskUsage.volumes?.length || 0} ({formatBytes(
                  diskUsage.volumes?.reduce((sum: number, v: any) => sum + (v.size > 0 ? v.size : 0), 0) || 0
                )})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Build Cache</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {diskUsage.buildCache?.length || 0} ({formatBytes(
                  diskUsage.buildCache?.reduce((sum: number, c: any) => sum + c.size, 0) || 0
                )})
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;