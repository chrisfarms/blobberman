package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/chrisfarms/vibes/blobberman/backend/pkg/types"
	"github.com/chrisfarms/vibes/blobberman/backend/pkg/websocket/common"
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
	HandleWebSocketWithDebug(hub, w, r, common.NoopDebugLogger)
}

// HandleWebSocketWithDebug handles WebSocket requests from clients with debug logging
func HandleWebSocketWithDebug(hub *Hub, w http.ResponseWriter, r *http.Request, debugLog common.DebugLoggerFunc) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		debugLog("Failed to upgrade connection: %v", err)
		return
	}

	remoteAddr := r.RemoteAddr
	debugLog("Connection from %s upgraded to WebSocket", remoteAddr)

	// Generate a temporary client ID
	// The client will send their persistent ID after connection
	tempClientID := "temp-" + uuid.New().String()
	debugLog("Assigned temporary client ID %s to connection from %s", tempClientID, remoteAddr)

	// Create a new client
	client := &common.Client{
		Hub:      hub,
		ID:       tempClientID,
		SendChan: make(chan common.ClientMessage, 256),
		DebugLog: debugLog,
	}

	// Register client with hub
	hub.Register <- client

	// Start goroutines for pumping messages
	go writePump(client, conn)
	go readPump(client, hub, conn)
}

// readPump pumps messages from the WebSocket connection to the hub
func readPump(client *common.Client, hub *Hub, conn *websocket.Conn) {
	defer func() {
		hub.Unregister <- client
		conn.Close()
	}()

	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		client.DebugLog("Received pong from client %s", client.ID)
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	client.DebugLog("Started reading messages from client %s", client.ID)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
				client.DebugLog("Unexpected close error for client %s: %v", client.ID, err)
			} else {
				client.DebugLog("Connection closed for client %s", client.ID)
			}
			break
		}

		client.DebugLog("Received message from client %s: %s", client.ID, string(message))

		// Try to decode the message type first to determine handling
		var baseMsg struct {
			Type types.MessageType `json:"type"`
		}
		if err := json.Unmarshal(message, &baseMsg); err != nil {
			log.Printf("Error decoding message type: %v", err)
			client.DebugLog("Error decoding message type from client %s: %v", client.ID, err)
			continue
		}

		// Handle different message types
		switch baseMsg.Type {
		case types.MessageTypeInput:
			// Handle input message
			var inputMsg types.InputMessage
			if err := json.Unmarshal(message, &inputMsg); err != nil {
				log.Printf("Error decoding input message: %v", err)
				client.DebugLog("Error decoding input message from client %s: %v", client.ID, err)
				continue
			}

			// Ensure the player ID matches the client ID
			if inputMsg.Input.PlayerID != client.ID {
				client.DebugLog("Player ID mismatch: got %s, expected %s", inputMsg.Input.PlayerID, client.ID)
				inputMsg.Input.PlayerID = client.ID
			}

			// Debug log the input
			inputJson, _ := json.Marshal(inputMsg.Input)
			client.DebugLog("Valid input from client %s: %s", client.ID, string(inputJson))

			// Add input to the current tick
			hub.AddInput(inputMsg.Input)

		case types.MessageTypeDisplayName:
			// Handle display name message
			var displayNameMsg types.DisplayNameMessage
			if err := json.Unmarshal(message, &displayNameMsg); err != nil {
				log.Printf("Error decoding display name message: %v", err)
				client.DebugLog("Error decoding display name message from client %s: %v", client.ID, err)
				continue
			}

			// Ensure the player ID matches the client ID
			if displayNameMsg.PlayerID != client.ID {
				client.DebugLog("Player ID mismatch in display name message: got %s, expected %s",
					displayNameMsg.PlayerID, client.ID)
				displayNameMsg.PlayerID = client.ID
			}

			// Update display name in the hub
			client.DebugLog("Updating display name for client %s: %s", client.ID, displayNameMsg.DisplayName)
			hub.UpdateDisplayName(client.ID, displayNameMsg.DisplayName)

		case types.MessageTypeClientId:
			// Handle client ID message
			var clientIdMsg types.ClientIdMessage
			if err := json.Unmarshal(message, &clientIdMsg); err != nil {
				log.Printf("Error decoding client ID message: %v", err)
				client.DebugLog("Error decoding client ID message from client %s: %v", client.ID, err)
				continue
			}

			oldId := client.ID
			newId := clientIdMsg.PlayerID

			// Update the client's ID
			client.DebugLog("Updating client ID from %s to %s", oldId, newId)

			// Transfer any data associated with the old ID to the new ID
			hub.UpdateClientId(oldId, newId)

			// Update the client's ID
			client.ID = newId

			// Optional: Log the ID update to server logs
			log.Printf("Client ID updated: %s -> %s", oldId, newId)

			// Send a new connect message to confirm the client ID update
			connectMsg := types.ConnectMessage{
				Type:         types.MessageTypeConnect,
				PlayerID:     client.ID,
				MaxTicks:     hub.maxHistorySize,
				TickInterval: hub.tickInterval,
			}

			select {
			case client.SendChan <- connectMsg:
				client.DebugLog("Connect message sent to client after ID update %s", client.ID)
			default:
				client.DebugLog("Failed to send connect message to client after ID update %s", client.ID)
			}

			// Send history to the client again
			hub.sendHistoryToClient(client)

			// Send current display names to the client
			hub.SendDisplayNamesToClient(client)

		default:
			client.DebugLog("Unknown message type from client %s: %s", client.ID, baseMsg.Type)
		}
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func writePump(client *common.Client, conn *websocket.Conn) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
		client.DebugLog("Write pump for client %s terminated", client.ID)
	}()

	client.DebugLog("Started writing messages to client %s", client.ID)

	for {
		select {
		case message, ok := <-client.SendChan:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				client.DebugLog("Send channel closed for client %s, closing connection", client.ID)
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Marshal the message to JSON here, right before sending
			messageBytes, err := json.Marshal(message)
			if err != nil {
				client.DebugLog("Error marshalling message for client %s: %v", client.ID, err)
				continue
			}

			// Write as a single message
			err = conn.WriteMessage(websocket.TextMessage, messageBytes)
			if err != nil {
				client.DebugLog("Error writing message to client %s: %v", client.ID, err)
				return
			}

			client.DebugLog("Successfully wrote message of type %s to client %s", message.GetType(), client.ID)

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			client.DebugLog("Sending ping to client %s", client.ID)
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				client.DebugLog("Error sending ping to client %s: %v", client.ID, err)
				return
			}
		}
	}
}
