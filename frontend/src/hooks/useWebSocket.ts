import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayerInput,
  GameTick,
  ConnectMessage,
  TickMessage,
  InputMessage
} from '@/types/shared';
import { ConnectionState } from '@/types/ConnectionState';
import { ENV } from '@/utils/env';

// Get WebSocket URL from environment
const WS_URL = ENV.WS_URL;

export interface UseWebSocketResult {
  connectionState: ConnectionState;
  playerId: string | null;
  latestTick: GameTick | null;
  sendInput: (input: Omit<PlayerInput, 'playerId'>) => void;
}

export const useWebSocket = (): UseWebSocketResult => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [latestTick, setLatestTick] = useState<GameTick | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Function to connect to WebSocket server
  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // If a socket already exists, close it
    if (socketRef.current) {
      socketRef.current.close();
    }

    // Update connection state
    setConnectionState('connecting');

    // Create a new WebSocket
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    // Set up event handlers
    socket.onopen = () => {
      console.log('WebSocket connection established');
      setConnectionState('connected');
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle different message types
        switch (message.type) {
          case 'connect':
            const connectMsg = message as ConnectMessage;
            setPlayerId(connectMsg.playerId);
            console.log(`Connected with player ID: ${connectMsg.playerId}`);
            break;

          case 'tick':
            const tickMsg = message as TickMessage;
            setLatestTick(tickMsg.tick);
            break;

          default:
            console.warn('Unhandled message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket connection closed');
      setConnectionState('disconnected');
      socketRef.current = null;

      // Attempt to reconnect after a delay
      reconnectTimeoutRef.current = window.setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, []);

  // Function to send player input to the server
  const sendInput = useCallback((input: Omit<PlayerInput, 'playerId'>) => {
    if (socketRef.current && connectionState === 'connected' && playerId) {
      const inputMessage: InputMessage = {
        type: 'input',
        input: {
          ...input,
          playerId
        }
      };

      socketRef.current.send(JSON.stringify(inputMessage));
    }
  }, [connectionState, playerId]);

  // Connect on mount and reconnect if WS_URL changes
  useEffect(() => {
    connect();

    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    connectionState,
    playerId,
    latestTick,
    sendInput
  };
};
