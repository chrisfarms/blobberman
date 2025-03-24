import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayerInput,
  GameTick,
  ConnectMessage,
  TickMessage,
  InputMessage,
  HistorySyncMessage,
  ResetMessage,
  DisplayNameUpdateMessage
} from '@/types/shared';
import { ConnectionState } from '@/types/ConnectionState';
import { ENV } from '@/utils/env';
import { createInitialGameState, GameState, processGameTick } from '@/game/simulation';
import { usePlayerData } from './usePlayerData';

// Get WebSocket URL from environment
const WS_URL = ENV.WS_URL;

export interface UseWebSocketResult {
  connectionState: ConnectionState;
  playerId: string;
  displayName: string | null;
  gameState: GameState;
  resetCountdown: number | null;
  playerDisplayNames: Record<string, string>;
  sendInput: (input: Omit<PlayerInput, 'playerId'>) => void;
  setDisplayName: (name: string) => void;
  resetPlayerData: () => void;
}

export const useWebSocket = (): UseWebSocketResult => {
  const { playerId, displayName, setDisplayName, resetPlayerData } = usePlayerData();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  const [playerDisplayNames, setPlayerDisplayNames] = useState<Record<string, string>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const pendingTicksRef = useRef<GameTick[]>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingHistory = useRef<boolean>(false);

  // Process game history from server
  const processGameHistory = useCallback((historyMsg: HistorySyncMessage) => {
    console.log(`Processing game history: ticks ${historyMsg.fromTick} to ${historyMsg.toTick} (${historyMsg.history.length} ticks)`);

    // Process all history in a single synchronous loop
    const history = historyMsg.history;
    let lastProcessedTick = -1;

    // Process each tick in sequence
    for (let i = 0; i < history.length; i++) {
      const tick = history[i];

      // Skip if we've already processed this tick
      if (tick.tick <= lastProcessedTick) {
        console.log(`Skipping duplicate tick ${tick.tick} (already processed ${lastProcessedTick})`);
        continue;
      }

      setGameState(currentState => {
        const newState = processGameTick(currentState, tick);
        lastProcessedTick = tick.tick;

        // Only check for game over if we're not already in a game over state
        if (!newState.gameOver && newState.maxTicks > 0 && newState.tick >= newState.maxTicks) {
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

    // History processing complete
    console.log('History processing complete');
    isProcessingHistory.current = false;

    // Process any pending ticks that came in while we were replaying history
    if (pendingTicksRef.current.length > 0) {
      console.log(`Processing ${pendingTicksRef.current.length} pending ticks after history`);

      // Sort ticks by tick number to ensure correct order
      pendingTicksRef.current.sort((a, b) => a.tick - b.tick);

      // Process each pending tick, skipping any we've already processed
      for (let i = 0; i < pendingTicksRef.current.length; i++) {
        const tick = pendingTicksRef.current[i];

        // Skip if we've already processed this tick
        if (tick.tick <= lastProcessedTick) {
          console.log(`Skipping duplicate pending tick ${tick.tick} (already processed ${lastProcessedTick})`);
          continue;
        }

        setGameState(currentState => {
          const newState = processGameTick(currentState, tick);
          lastProcessedTick = tick.tick;

          // Only check for game over if we're not already in a game over state
          if (!newState.gameOver && newState.maxTicks > 0 && newState.tick >= newState.maxTicks) {
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

      // Send our player ID to the server right after connection
      // This ensures the server uses our persistent ID instead of generating a new one
      if (playerId) {
        const playerIdMessage = {
          type: 'clientId',
          playerId: playerId
        };
        socket.send(JSON.stringify(playerIdMessage));
        console.log(`Sent our persistent player ID to server: ${playerId}`);
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Handle different message types
        switch (message.type) {
          case 'connect':
            const connectMsg = message as ConnectMessage;
            console.log(`Connected to server with our player ID: ${playerId}`);
            console.log(`Game session info: maxTicks=${connectMsg.maxTicks}, tickInterval=${connectMsg.tickInterval}ms`);

            // Update game state with session information
            setGameState(() => {
                const newState = createInitialGameState();
                const maxTicks = connectMsg.maxTicks;
                const tickInterval = connectMsg.tickInterval;
                return {
                    ...newState,
                    maxTicks,
                    tickInterval,
                    gameOver: false, // Ensure we're not in a game over state
                    winner: null // Clear any previous winner
                }
            });

            // Clear any existing countdown
            setResetCountdown(null);

            // Send our display name if we have one
            if (displayName) {
              sendDisplayName(displayName);
            }

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

                // Only check for game over if we're not already in a game over state
                if (!newState.gameOver && newState.maxTicks > 0 && newState.tick >= newState.maxTicks) {
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

          case 'reset':
            const resetMsg = message as ResetMessage;
            console.log(`Received reset countdown: ${resetMsg.countdownSec} seconds remaining`);

            // Update countdown state
            setResetCountdown(resetMsg.countdownSec);

            break;

          case 'displayName':
            const displayNameMsg = message as DisplayNameUpdateMessage;
            console.log('Received display names update:', displayNameMsg.displayNames);

            // Update state with display names
            setPlayerDisplayNames(displayNameMsg.displayNames);
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
  }, [playerId, displayName]);

  // Function to send player input to server
  const sendInput = useCallback((input: Omit<PlayerInput, 'playerId'>) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const inputMessage: InputMessage = {
        type: 'input',
        input: {
          ...input,
          playerId: playerId
        }
      };

      socketRef.current.send(JSON.stringify(inputMessage));
    }
  }, [playerId]);

  // Function to send display name update to server
  const sendDisplayName = useCallback((name: string) => {
    // Update local storage first
    setDisplayName(name);

    // Then send to server if connected
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const displayNameMessage = {
        type: 'displayName',
        playerId: playerId,
        displayName: name
      };

      socketRef.current.send(JSON.stringify(displayNameMessage));
    }
  }, [playerId, setDisplayName]);

  // Automatically connect on component mount
  useEffect(() => {
    connect();

    // Set up reconnection on disconnect
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
    displayName,
    gameState,
    resetCountdown,
    playerDisplayNames,
    sendInput,
    setDisplayName: sendDisplayName,
    resetPlayerData
  };
};
