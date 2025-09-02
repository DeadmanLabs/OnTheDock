import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocker } from '../contexts/DockerContext';
import * as api from '../services/api';
import toast from 'react-hot-toast';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface PortMapping {
  containerPort: string;
  hostPort: string;
  protocol: 'tcp' | 'udp';
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

interface EnvVariable {
  key: string;
  value: string;
}

const CreateContainer: React.FC = () => {
  const navigate = useNavigate();
  const { images, refreshContainers } = useDocker();
  const [currentStep, setCurrentStep] = useState(1);
  const [creating, setCreating] = useState(false);

  // Step 1: Basic Configuration
  const [containerName, setContainerName] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  const [command, setCommand] = useState('');
  const [entrypoint, setEntrypoint] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [user, setUser] = useState('');
  const [hostname, setHostname] = useState('');

  // Step 2: Ports
  const [ports, setPorts] = useState<PortMapping[]>([]);
  const [publishAllPorts, setPublishAllPorts] = useState(false);

  // Step 3: Volumes
  const [volumes, setVolumes] = useState<VolumeMount[]>([]);

  // Step 4: Environment
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);

  // Step 5: Network
  const [networkMode, setNetworkMode] = useState('bridge');
  const [networkName, setNetworkName] = useState('');
  const [dnsServers, setDnsServers] = useState('');
  const [extraHosts, setExtraHosts] = useState('');

  // Step 6: Resources
  const [memoryLimit, setMemoryLimit] = useState('');
  const [cpuLimit, setCpuLimit] = useState('');
  const [restartPolicy, setRestartPolicy] = useState('no');
  const [maxRestartCount, setMaxRestartCount] = useState('');
  const [privileged, setPrivileged] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  const steps = [
    { number: 1, name: 'Basic Configuration' },
    { number: 2, name: 'Ports' },
    { number: 3, name: 'Volumes' },
    { number: 4, name: 'Environment' },
    { number: 5, name: 'Network' },
    { number: 6, name: 'Resources & Restart' }
  ];

  const addPort = () => {
    setPorts([...ports, { containerPort: '', hostPort: '', protocol: 'tcp' }]);
  };

  const updatePort = (index: number, field: keyof PortMapping, value: string) => {
    const newPorts = [...ports];
    newPorts[index] = { ...newPorts[index], [field]: value };
    setPorts(newPorts);
  };

  const removePort = (index: number) => {
    setPorts(ports.filter((_, i) => i !== index));
  };

  const addVolume = () => {
    setVolumes([...volumes, { hostPath: '', containerPath: '', readOnly: false }]);
  };

  const updateVolume = (index: number, field: keyof VolumeMount, value: any) => {
    const newVolumes = [...volumes];
    newVolumes[index] = { ...newVolumes[index], [field]: value };
    setVolumes(newVolumes);
  };

  const removeVolume = (index: number) => {
    setVolumes(volumes.filter((_, i) => i !== index));
  };

  const addEnvVariable = () => {
    setEnvVariables([...envVariables, { key: '', value: '' }]);
  };

  const updateEnvVariable = (index: number, field: keyof EnvVariable, value: string) => {
    const newVars = [...envVariables];
    newVars[index] = { ...newVars[index], [field]: value };
    setEnvVariables(newVars);
  };

  const removeEnvVariable = (index: number) => {
    setEnvVariables(envVariables.filter((_, i) => i !== index));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!selectedImage) {
          toast.error('Please select an image');
          return false;
        }
        return true;
      case 2:
        for (const port of ports) {
          if (port.containerPort && !port.hostPort) {
            toast.error('Please specify host port for all mapped container ports');
            return false;
          }
        }
        return true;
      case 3:
        for (const volume of volumes) {
          if ((volume.hostPath && !volume.containerPath) || (!volume.hostPath && volume.containerPath)) {
            toast.error('Please specify both host and container paths for volumes');
            return false;
          }
        }
        return true;
      case 4:
        for (const env of envVariables) {
          if ((env.key && !env.value) || (!env.key && env.value)) {
            toast.error('Please specify both key and value for environment variables');
            return false;
          }
        }
        return true;
      case 5:
        return true;
      case 6:
        if (restartPolicy === 'on-failure' && !maxRestartCount) {
          toast.error('Please specify maximum restart count for on-failure policy');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(Math.min(currentStep + 1, steps.length));
    }
  };

  const prevStep = () => {
    setCurrentStep(Math.max(currentStep - 1, 1));
  };

  const handleCreate = async () => {
    if (!validateStep(currentStep)) return;

    setCreating(true);
    try {
      const config: any = {
        image: selectedImage,
        name: containerName || undefined,
        command: command ? command.split(' ') : undefined,
        entrypoint: entrypoint ? entrypoint.split(' ') : undefined,
        workingDir: workingDir || undefined,
        user: user || undefined,
        hostname: hostname || undefined,
        env: envVariables.filter(e => e.key).map(e => `${e.key}=${e.value}`),
        exposedPorts: {},
        hostConfig: {
          publishAllPorts,
          portBindings: {},
          binds: volumes.filter(v => v.hostPath).map(v => 
            `${v.hostPath}:${v.containerPath}${v.readOnly ? ':ro' : ''}`
          ),
          networkMode: networkMode === 'custom' ? networkName : networkMode,
          dns: dnsServers ? dnsServers.split(',').map(s => s.trim()) : undefined,
          extraHosts: extraHosts ? extraHosts.split('\n').filter(Boolean) : undefined,
          memory: memoryLimit ? parseInt(memoryLimit) * 1024 * 1024 : undefined,
          cpuShares: cpuLimit ? parseInt(cpuLimit) * 1024 : undefined,
          restartPolicy: {
            name: restartPolicy,
            maximumRetryCount: restartPolicy === 'on-failure' ? parseInt(maxRestartCount) : undefined
          },
          privileged,
          readonlyRootfs: readOnly
        }
      };

      // Configure port bindings
      ports.filter(p => p.containerPort).forEach(port => {
        const containerPortKey = `${port.containerPort}/${port.protocol}`;
        config.exposedPorts[containerPortKey] = {};
        if (port.hostPort) {
          config.hostConfig.portBindings[containerPortKey] = [
            { HostPort: port.hostPort }
          ];
        }
      });

      const containerId = await api.createContainer(config);
      toast.success('Container created successfully');
      
      if (confirm('Start the container now?')) {
        await api.startContainer(containerId);
        toast.success('Container started');
      }

      await refreshContainers();
      navigate(`/containers/${containerId}`);
    } catch (error: any) {
      toast.error(`Failed to create container: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Container</h1>
        <button
          onClick={() => navigate('/containers')}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div
            key={step.number}
            className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
          >
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                currentStep >= step.number
                  ? 'bg-docker-blue text-white border-docker-blue'
                  : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-300'
              }`}
            >
              {step.number}
            </div>
            <div className="ml-2">
              <p className={`text-sm font-medium ${
                currentStep >= step.number ? 'text-gray-900 dark:text-white' : 'text-gray-400'
              }`}>
                {step.name}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-4 ${
                currentStep > step.number ? 'bg-docker-blue' : 'bg-gray-300'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="card">
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Basic Configuration</h2>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Image <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedImage}
                onChange={(e) => setSelectedImage(e.target.value)}
                className="input w-full"
              >
                <option value="">Select an image...</option>
                {images.map((image) => (
                  <option key={image.id} value={image.tags[0] || image.id}>
                    {image.tags.join(', ') || image.id.substring(0, 12)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Container Name</label>
              <input
                type="text"
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
                placeholder="my-container"
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional. Docker will generate a random name if not specified.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Command</label>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npm start"
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Override the default command specified in the image.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Entrypoint</label>
              <input
                type="text"
                value={entrypoint}
                onChange={(e) => setEntrypoint(e.target.value)}
                placeholder="/bin/sh"
                className="input w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Working Directory</label>
                <input
                  type="text"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  placeholder="/app"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">User</label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="1000:1000"
                  className="input w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Hostname</label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="my-host"
                className="input w-full"
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Port Configuration</h2>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={publishAllPorts}
                  onChange={(e) => setPublishAllPorts(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">Publish all exposed ports</span>
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Port Mappings</label>
                <button
                  onClick={addPort}
                  className="btn-secondary btn-sm"
                >
                  <PlusIcon className="w-4 h-4 mr-1" />
                  Add Port
                </button>
              </div>

              {ports.length === 0 ? (
                <p className="text-gray-500 text-sm">No port mappings configured</p>
              ) : (
                <div className="space-y-2">
                  {ports.map((port, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={port.hostPort}
                        onChange={(e) => updatePort(index, 'hostPort', e.target.value)}
                        placeholder="Host port"
                        className="input w-32"
                      />
                      <span className="text-gray-500">→</span>
                      <input
                        type="text"
                        value={port.containerPort}
                        onChange={(e) => updatePort(index, 'containerPort', e.target.value)}
                        placeholder="Container port"
                        className="input w-32"
                      />
                      <select
                        value={port.protocol}
                        onChange={(e) => updatePort(index, 'protocol', e.target.value)}
                        className="input w-24"
                      >
                        <option value="tcp">TCP</option>
                        <option value="udp">UDP</option>
                      </select>
                      <button
                        onClick={() => removePort(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Volume Mounts</h2>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Volumes</label>
                <button
                  onClick={addVolume}
                  className="btn-secondary btn-sm"
                >
                  <PlusIcon className="w-4 h-4 mr-1" />
                  Add Volume
                </button>
              </div>

              {volumes.length === 0 ? (
                <p className="text-gray-500 text-sm">No volumes configured</p>
              ) : (
                <div className="space-y-2">
                  {volumes.map((volume, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={volume.hostPath}
                        onChange={(e) => updateVolume(index, 'hostPath', e.target.value)}
                        placeholder="Host path or volume name"
                        className="input flex-1"
                      />
                      <span className="text-gray-500">→</span>
                      <input
                        type="text"
                        value={volume.containerPath}
                        onChange={(e) => updateVolume(index, 'containerPath', e.target.value)}
                        placeholder="Container path"
                        className="input flex-1"
                      />
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={volume.readOnly}
                          onChange={(e) => updateVolume(index, 'readOnly', e.target.checked)}
                          className="rounded mr-1"
                        />
                        <span className="text-sm">RO</span>
                      </label>
                      <button
                        onClick={() => removeVolume(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Environment Variables</h2>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Environment Variables</label>
                <button
                  onClick={addEnvVariable}
                  className="btn-secondary btn-sm"
                >
                  <PlusIcon className="w-4 h-4 mr-1" />
                  Add Variable
                </button>
              </div>

              {envVariables.length === 0 ? (
                <p className="text-gray-500 text-sm">No environment variables configured</p>
              ) : (
                <div className="space-y-2">
                  {envVariables.map((env, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={env.key}
                        onChange={(e) => updateEnvVariable(index, 'key', e.target.value)}
                        placeholder="Variable name"
                        className="input flex-1"
                      />
                      <span className="text-gray-500">=</span>
                      <input
                        type="text"
                        value={env.value}
                        onChange={(e) => updateEnvVariable(index, 'value', e.target.value)}
                        placeholder="Value"
                        className="input flex-1"
                      />
                      <button
                        onClick={() => removeEnvVariable(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Network Configuration</h2>

            <div>
              <label className="block text-sm font-medium mb-2">Network Mode</label>
              <select
                value={networkMode}
                onChange={(e) => setNetworkMode(e.target.value)}
                className="input w-full"
              >
                <option value="bridge">Bridge</option>
                <option value="host">Host</option>
                <option value="none">None</option>
                <option value="custom">Custom Network</option>
              </select>
            </div>

            {networkMode === 'custom' && (
              <div>
                <label className="block text-sm font-medium mb-2">Network Name</label>
                <input
                  type="text"
                  value={networkName}
                  onChange={(e) => setNetworkName(e.target.value)}
                  placeholder="my-network"
                  className="input w-full"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">DNS Servers</label>
              <input
                type="text"
                value={dnsServers}
                onChange={(e) => setDnsServers(e.target.value)}
                placeholder="8.8.8.8, 8.8.4.4"
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated list of DNS servers</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Extra Hosts</label>
              <textarea
                value={extraHosts}
                onChange={(e) => setExtraHosts(e.target.value)}
                placeholder="hostname:192.168.1.100"
                className="input w-full h-24"
              />
              <p className="text-xs text-gray-500 mt-1">One entry per line, format: hostname:ip</p>
            </div>
          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Resources & Restart Policy</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Memory Limit (MB)</label>
                <input
                  type="number"
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(e.target.value)}
                  placeholder="512"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">CPU Limit (cores)</label>
                <input
                  type="number"
                  value={cpuLimit}
                  onChange={(e) => setCpuLimit(e.target.value)}
                  placeholder="1"
                  step="0.1"
                  className="input w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Restart Policy</label>
              <select
                value={restartPolicy}
                onChange={(e) => setRestartPolicy(e.target.value)}
                className="input w-full"
              >
                <option value="no">No</option>
                <option value="always">Always</option>
                <option value="on-failure">On Failure</option>
                <option value="unless-stopped">Unless Stopped</option>
              </select>
            </div>

            {restartPolicy === 'on-failure' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Maximum Restart Count <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={maxRestartCount}
                  onChange={(e) => setMaxRestartCount(e.target.value)}
                  placeholder="3"
                  className="input w-full"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={privileged}
                  onChange={(e) => setPrivileged(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">Privileged Mode</span>
              </label>
              <p className="text-xs text-gray-500 ml-6">
                Gives the container full access to the host system
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={readOnly}
                  onChange={(e) => setReadOnly(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">Read-only Root Filesystem</span>
              </label>
              <p className="text-xs text-gray-500 ml-6">
                Mounts the container's root filesystem as read-only
              </p>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <button
            onClick={prevStep}
            disabled={currentStep === 1}
            className="btn-secondary flex items-center"
          >
            <ChevronLeftIcon className="w-5 h-5 mr-2" />
            Previous
          </button>

          {currentStep < steps.length ? (
            <button
              onClick={nextStep}
              className="btn-primary flex items-center"
            >
              Next
              <ChevronRightIcon className="w-5 h-5 ml-2" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary flex items-center"
            >
              {creating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon className="w-5 h-5 mr-2" />
                  Create Container
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateContainer;