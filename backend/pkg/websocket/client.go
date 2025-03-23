package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/chrisfarms/vibes/blobberman/backend/pkg/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all origins
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// HandleWebSocket handles WebSocket requests from clients with default no-op logger
func HandleWebSocket(hub *Hub, w http.ResponseWriter, r *http.Request) {
	HandleWebSocketWithDebug(hub, w, r, noopDebugLogger)
}

// HandleWebSocketWithDebug handles WebSocket requests from clients with debug logging
func HandleWebSocketWithDebug(hub *Hub, w http.ResponseWriter, r *http.Request, debugLog DebugLoggerFunc) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		debugLog("Failed to upgrade connection: %v", err)
		return
	}

	remoteAddr := r.RemoteAddr
	debugLog("Connection from %s upgraded to WebSocket", remoteAddr)

	// Generate a unique client ID
	clientID := uuid.New().String()
	debugLog("Assigned client ID %s to connection from %s", clientID, remoteAddr)

	// Create a new client
	client := &Client{
		Hub:      hub,
		ID:       clientID,
		SendChan: make(chan []byte, 256),
		debugLog: debugLog,
	}

	// Register client with hub
	hub.Register <- client

	// Send a connect message to the client
	connectMsg := types.ConnectMessage{
		Type:     types.MessageTypeConnect,
		PlayerID: clientID,
	}

	connectData, err := encodeMessage(connectMsg)
	if err != nil {
		log.Printf("Error encoding connect message: %v", err)
		debugLog("Error encoding connect message for client %s: %v", clientID, err)
	} else {
		debugLog("Sending connect message to client %s", clientID)
		client.SendChan <- connectData
	}

	// Start goroutines for pumping messages
	go client.writePump(conn)
	go client.readPump(conn)
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump(conn *websocket.Conn) {
	defer func() {
		c.Hub.Unregister <- c
		conn.Close()
	}()

	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		c.debugLog("Received pong from client %s", c.ID)
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	c.debugLog("Started reading messages from client %s", c.ID)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
				c.debugLog("Unexpected close error for client %s: %v", c.ID, err)
			} else {
				c.debugLog("Connection closed for client %s", c.ID)
			}
			break
		}

		c.debugLog("Received message from client %s: %s", c.ID, string(message))

		// Try to decode as an input message
		var inputMsg types.InputMessage
		if err := decodeMessage(message, &inputMsg); err != nil {
			log.Printf("Error decoding input message: %v", err)
			c.debugLog("Error decoding input message from client %s: %v", c.ID, err)
			continue
		}

		// Verify input message type
		if inputMsg.Type != types.MessageTypeInput {
			c.debugLog("Invalid message type from client %s: %s", c.ID, inputMsg.Type)
			continue
		}

		// Ensure the player ID matches the client ID
		if inputMsg.Input.PlayerID != c.ID {
			c.debugLog("Player ID mismatch: got %s, expected %s", inputMsg.Input.PlayerID, c.ID)
			inputMsg.Input.PlayerID = c.ID
		}

		// Debug log the input
		inputJson, _ := json.Marshal(inputMsg.Input)
		c.debugLog("Valid input from client %s: %s", c.ID, string(inputJson))

		// Add input to the current tick
		c.Hub.AddInput(inputMsg.Input)
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump(conn *websocket.Conn) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
		c.debugLog("Write pump for client %s terminated", c.ID)
	}()

	c.debugLog("Started writing messages to client %s", c.ID)

	for {
		select {
		case message, ok := <-c.SendChan:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				c.debugLog("Send channel closed for client %s, closing connection", c.ID)
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := conn.NextWriter(websocket.TextMessage)
			if err != nil {
				c.debugLog("Error getting next writer for client %s: %v", c.ID, err)
				return
			}

			c.debugLog("Writing %d bytes to client %s", len(message), c.ID)
			w.Write(message)

			// Add queued messages to the current WebSocket message
			n := len(c.SendChan)
			if n > 0 {
				c.debugLog("Writing %d additional queued messages to client %s", n, c.ID)
			}
			for i := 0; i < n; i++ {
				additionalMsg := <-c.SendChan
				w.Write(additionalMsg)
			}

			if err := w.Close(); err != nil {
				c.debugLog("Error closing writer for client %s: %v", c.ID, err)
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			c.debugLog("Sending ping to client %s", c.ID)
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.debugLog("Error sending ping to client %s: %v", c.ID, err)
				return
			}
		}
	}
}
