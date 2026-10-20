// src/contexts/SocketContext.jsx
'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const getSocketUrl = () => {
      const envUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
      if (envUrl && envUrl.trim()) {
        return envUrl.trim().replace(/\/+$/, '');
      }

      if (typeof window === 'undefined') {
        return 'http://localhost:3001';
      }

      const origin = window.location.origin;
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      return isLocalhost ? 'http://localhost:3001' : origin;
    };

    const socketUrl = getSocketUrl();
    const socketIO = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    setSocket(socketIO);

    socketIO.on('connect', () => {
      console.log('Socket connected:', socketIO.id);
      setConnected(true);
    });

    socketIO.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    socketIO.on('connect_error', (error) => {
      console.error('Socket connect error:', error);
      setConnected(false);
    });

    socketIO.on('reconnect_attempt', (attempt) => {
      console.log('Socket reconnect attempt:', attempt);
    });

    return () => {
      socketIO.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

// Export both names so existing and new code both work
export const useSocket = () => useContext(SocketContext);
export const useSocketContext = () => useContext(SocketContext);