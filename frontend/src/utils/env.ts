// Environment variables access
export const ENV = {
  WS_URL: import.meta.env.MODE === 'development'
    ? import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'
    : `ws${window.location.protocol === 'https:' ? 's' : ''}:${window.location.host}/ws`,
  DEV_MODE: import.meta.env.VITE_DEV_MODE === 'true',
};
