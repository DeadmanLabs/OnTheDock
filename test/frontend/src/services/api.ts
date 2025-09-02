import axios from 'axios';
import { Container, Image, SystemInfo, ContainerSpec, ContainerStats, LogEntry, FileInfo } from '../types/docker';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Containers
export const getContainers = async (all = true): Promise<Container[]> => {
  const { data } = await api.get('/containers', { params: { all } });
  return data;
};

export const getContainer = async (id: string): Promise<Container> => {
  const { data } = await api.get(`/containers/${id}`);
  return data;
};

export const createContainer = async (spec: ContainerSpec): Promise<{ id: string }> => {
  const { data } = await api.post('/containers', spec);
  return data;
};

export const startContainer = async (id: string): Promise<void> => {
  await api.post(`/containers/${id}/start`);
};

export const stopContainer = async (id: string, timeout?: number): Promise<void> => {
  await api.post(`/containers/${id}/stop`, { timeout });
};

export const restartContainer = async (id: string, timeout?: number): Promise<void> => {
  await api.post(`/containers/${id}/restart`, { timeout });
};

export const pauseContainer = async (id: string): Promise<void> => {
  await api.post(`/containers/${id}/pause`);
};

export const unpauseContainer = async (id: string): Promise<void> => {
  await api.post(`/containers/${id}/unpause`);
};

export const removeContainer = async (id: string, force = false): Promise<void> => {
  await api.delete(`/containers/${id}`, { params: { force } });
};

export const killContainer = async (id: string, signal?: string): Promise<void> => {
  await api.post(`/containers/${id}/kill`, { signal });
};

// Images
export const getImages = async (): Promise<Image[]> => {
  const { data } = await api.get('/images');
  return data;
};

export const pullImage = async (image: string, tag = 'latest'): Promise<void> => {
  await api.post('/images/pull', { image, options: { tag } });
};

export const removeImage = async (id: string, force = false): Promise<void> => {
  await api.delete(`/images/${id}`, { params: { force } });
};

// System
export const getSystemInfo = async (): Promise<SystemInfo> => {
  const { data } = await api.get('/system/info');
  return data;
};

export const getSystemResources = async () => {
  const { data } = await api.get('/system/resources');
  return data;
};

export const getDiskUsage = async () => {
  const { data } = await api.get('/system/df');
  return data;
};

export const pruneSystem = async (options: any) => {
  const { data } = await api.post('/system/prune', options);
  return data;
};

// Logs
export const getContainerLogs = async (id: string, tail = 100): Promise<{ logs: string }> => {
  const { data } = await api.get(`/logs/containers/${id}`, { params: { tail } });
  return data;
};

export const tailContainerLogs = async (id: string, lines = 100): Promise<LogEntry[]> => {
  const { data } = await api.get(`/logs/containers/${id}/tail`, { params: { lines } });
  return data;
};

// Stats
export const getContainerStats = async (id: string): Promise<ContainerStats> => {
  const { data } = await api.get(`/stats/containers/${id}`);
  return data;
};

// Exec
export const execCommand = async (containerId: string, cmd: string[]): Promise<any> => {
  const { data } = await api.post(`/exec/containers/${containerId}/command`, { cmd });
  return data;
};

// Files
export const listFiles = async (containerId: string, path: string): Promise<FileInfo[]> => {
  const { data } = await api.get(`/files/containers/${containerId}/ls`, { params: { path } });
  return data;
};

export const downloadFile = async (containerId: string, path: string): Promise<Blob> => {
  const { data } = await api.get(`/files/containers/${containerId}/download`, {
    params: { path },
    responseType: 'blob',
  });
  return data;
};

export const uploadFile = async (containerId: string, path: string, file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);
  
  await api.post(`/files/containers/${containerId}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const deleteFile = async (containerId: string, path: string): Promise<void> => {
  await api.delete(`/files/containers/${containerId}/file`, { params: { path } });
};

export const createDirectory = async (containerId: string, path: string): Promise<void> => {
  await api.post(`/files/containers/${containerId}/mkdir`, { path, recursive: true });
};