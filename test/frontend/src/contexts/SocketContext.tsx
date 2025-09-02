import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  subscribe: (room: string) => void;
  unsubscribe: (room: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  subscribe: () => {},
  unsubscribe: () => {},
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io('/containers', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      setConnected(true);
      toast.success('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      toast.error('Disconnected from server');
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      toast.error('Connection error');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const subscribe = (room: string) => {
    if (socket) {
      socket.emit('subscribe', room);
    }
  };

  const unsubscribe = (room: string) => {
    if (socket) {
      socket.emit('unsubscribe', room);
    }
  };

  return (
    <SocketContext.Provider value={{ socket, connected, subscribe, unsubscribe }}>
      {children}
    </SocketContext.Provider>
  );
};