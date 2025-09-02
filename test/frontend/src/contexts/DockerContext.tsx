import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSocket } from './SocketContext';
import * as api from '../services/api';
import { Container, Image, SystemInfo } from '../types/docker';

interface DockerContextType {
  containers: Container[];
  images: Image[];
  systemInfo: SystemInfo | null;
  loading: boolean;
  error: string | null;
  refreshContainers: () => Promise<void>;
  refreshImages: () => Promise<void>;
  refreshSystemInfo: () => Promise<void>;
}

const DockerContext = createContext<DockerContextType>({
  containers: [],
  images: [],
  systemInfo: null,
  loading: false,
  error: null,
  refreshContainers: async () => {},
  refreshImages: async () => {},
  refreshSystemInfo: async () => {},
});

export const useDocker = () => useContext(DockerContext);

export const DockerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<Image[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshContainers = async () => {
    try {
      setLoading(true);
      const data = await api.getContainers();
      setContainers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshImages = async () => {
    try {
      setLoading(true);
      const data = await api.getImages();
      setImages(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshSystemInfo = async () => {
    try {
      const data = await api.getSystemInfo();
      setSystemInfo(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refreshContainers();
    refreshImages();
    refreshSystemInfo();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('status', (data) => {
      refreshContainers();
    });

    socket.on('image:pull', (data) => {
      refreshImages();
    });

    return () => {
      socket.off('status');
      socket.off('image:pull');
    };
  }, [socket]);

  return (
    <DockerContext.Provider
      value={{
        containers,
        images,
        systemInfo,
        loading,
        error,
        refreshContainers,
        refreshImages,
        refreshSystemInfo,
      }}
    >
      {children}
    </DockerContext.Provider>
  );
};