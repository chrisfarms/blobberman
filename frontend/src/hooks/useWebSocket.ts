import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayerInput,
  GameTick,
  ConnectMessage,
  TickMessage,
  InputMessage,
  HistorySyncMessage
} from '@/types/shared';
import { ConnectionState } from '@/types/ConnectionState';
import { ENV } from '@/utils/env';
import { createInitialGameState, GameState, processGameTick } from '@/game/simulation';

// Get WebSocket URL from environment
const WS_URL = ENV.WS_URL;

export interface UseWebSocketResult {
  connectionState: ConnectionState;
  playerId: string | null;
  gameState: GameState | null;
  sendInput: (input: Omit<PlayerInput, 'playerId'>) => void;
}

export const useWebSocket = (): UseWebSocketResult => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const isProcessingHistory = useRef<boolean>(true);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Queue to store ticks that arrive while processing history
  const pendingTicksRef = useRef<GameTick[]>([]);

  // Process game history from server
  const processGameHistory = useCallback((historyMsg: HistorySyncMessage) => {
    console.log(`Processing game history: ticks ${historyMsg.fromTick} to ${historyMsg.toTick} (${historyMsg.history.length} ticks)`);

    // Process history with small delays to avoid freezing the UI
    const history = historyMsg.history;
    let currentIndex = 0;

    const processNextBatch = () => {
      const batchSize = 20; // Process 20 ticks at once
      const endIndex = Math.min(currentIndex + batchSize, history.length);

      // Process this batch of ticks
      for (let i = currentIndex; i < endIndex; i++) {
        setGameState(currentState => {
          const newState = processGameTick(currentState, history[i]);

          // Check if this is the last tick and if game should be over
          if (i === history.length - 1 && newState.maxTicks > 0 && newState.tick >= newState.maxTicks) {
            // Find the winner (player with the most painted tiles)
            let maxPaintedCount = 0;
            let winner: string | null = null;

            for (const [playerId, count] of newState.paintedCounts.entries()) {
              if (count > maxPaintedCount) {
                maxPaintedCount = count;
                winner = playerId;
              } else if (count === maxPaintedCount && count > 0) {
                // If there's a tie, set winner to null
                winner = null;
              }
            }

            console.log(`Game over from history! Winner: ${winner || 'Tie'}`);
            return {
              ...newState,
              gameOver: true,
              winner
            };
          }

          return newState;
        });
      }

      currentIndex = endIndex;

      if (currentIndex < history.length) {
        // Schedule next batch
        setTimeout(processNextBatch, 0);
      } else {
        // History processing complete
        console.log('History processing complete');
        isProcessingHistory.current = false;

        // Process any pending ticks that came in while we were replaying history
        if (pendingTicksRef.current.length > 0) {
          console.log(`Processing ${pendingTicksRef.current.length} pending ticks after history`);

          // Sort ticks by tick number to ensure correct order
          pendingTicksRef.current.sort((a, b) => a.tick - b.tick);

          // Process each pending tick
          for (let i = 0; i < pendingTicksRef.current.length; i++) {
            const tick = pendingTicksRef.current[i];
            setGameState(currentState => {
              const newState = processGameTick(currentState, tick);

              // Check if this is the last pending tick and if the game should be over
              if (i === pendingTicksRef.current.length - 1 &&
                  newState.maxTicks > 0 && newState.tick >= newState.maxTicks &&
                  !newState.gameOver) {
                // Find the winner (player with the most painted tiles)
                let maxPaintedCount = 0;
                let winner: string | null = null;

                for (const [playerId, count] of newState.paintedCounts.entries()) {
                  if (count > maxPaintedCount) {
                    maxPaintedCount = count;
                    winner = playerId;
                  } else if (count === maxPaintedCount && count > 0) {
                    // If there's a tie, set winner to null
                    winner = null;
                  }
                }

                console.log(`Game over from pending ticks! Winner: ${winner || 'Tie'}`);
                return {
                  ...newState,
                  gameOver: true,
                  winner
                };
              }

              return newState;
            });
          }

          // Clear the queue
          pendingTicksRef.current = [];
        }
      }
    };

    // Start processing
    processNextBatch();
  }, []);

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
            console.log(`Game session info: maxTicks=${connectMsg.maxTicks}, tickInterval=${connectMsg.tickInterval}ms`);

            // Update game state with session information
            setGameState(currentState => ({
              ...currentState,
              maxTicks: connectMsg.maxTicks,
              tickInterval: connectMsg.tickInterval
            }));
            break;

          case 'tick':
            const tickMsg = message as TickMessage;

            // If we're processing history, queue new ticks for later
            if (isProcessingHistory.current) {
              console.log(`Queuing tick ${tickMsg.tick.tick} while processing history`);
              pendingTicksRef.current.push(tickMsg.tick);
            } else {
              // Process the game tick
              setGameState(currentState => {
                const newState = processGameTick(currentState, tickMsg.tick);

                // Check if game is over
                if (newState.maxTicks > 0 && newState.tick >= newState.maxTicks && !newState.gameOver) {
                  // Find the winner (player with the most painted tiles)
                  let maxPaintedCount = 0;
                  let winner: string | null = null;

                  for (const [playerId, count] of newState.paintedCounts.entries()) {
                    if (count > maxPaintedCount) {
                      maxPaintedCount = count;
                      winner = playerId;
                    } else if (count === maxPaintedCount && count > 0) {
                      // If there's a tie, set winner to null
                      winner = null;
                    }
                  }

                  console.log(`Game over! Winner: ${winner || 'Tie'}`);
                  return {
                    ...newState,
                    gameOver: true,
                    winner
                  };
                }

                return newState;
              });
            }
            break;

          case 'historySync':
            const historyMsg = message as HistorySyncMessage;
            console.log(`Received history sync: ${historyMsg.history.length} ticks`);

            if (historyMsg.history.length > 0) {
              // Process the game history
              processGameHistory(historyMsg);
            }
            break;

          default:
            console.warn('Unhandled message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing message:', error, event.data);
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
  }, [processGameHistory]);

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
    gameState,
    sendInput
  };
};
