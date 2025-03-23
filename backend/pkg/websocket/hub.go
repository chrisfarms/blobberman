package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/chrisfarms/vibes/blobberman/backend/pkg/types"
)

// DebugLoggerFunc is a function type for debug logging
type DebugLoggerFunc func(format string, args ...interface{})

// noopDebugLogger is a no-op debug logger
func noopDebugLogger(format string, args ...interface{}) {}

// Client represents a connected WebSocket client
type Client struct {
	Hub      *Hub
	ID       string
	SendChan chan []byte
	Mutex    sync.Mutex
	debugLog DebugLoggerFunc
}

// Hub manages WebSocket client connections and game state
type Hub struct {
	// Registered clients
	Clients map[*Client]bool

	// Channel for registering clients
	Register chan *Client

	// Channel for unregistering clients
	Unregister chan *Client

	// Channel for broadcasting messages to all clients
	Broadcast chan []byte

	// Current game tick
	CurrentTick uint64

	// Inputs received for the current tick
	CurrentInputs []types.PlayerInput

	// Mutex to protect input access
	InputMutex sync.Mutex

	// Debug logger function
	debugLog DebugLoggerFunc
}

// NewHub creates a new Hub instance with default no-op logger
func NewHub() *Hub {
	return NewHubWithDebug(noopDebugLogger)
}

// NewHubWithDebug creates a new Hub instance with the provided debug logger
func NewHubWithDebug(debugLog DebugLoggerFunc) *Hub {
	return &Hub{
		Clients:       make(map[*Client]bool),
		Register:      make(chan *Client),
		Unregister:    make(chan *Client),
		Broadcast:     make(chan []byte, 1),
		CurrentTick:   0,
		CurrentInputs: make([]types.PlayerInput, 0),
		debugLog:      debugLog,
	}
}

// Run starts the hub, processing client connections and game ticks
func (h *Hub) Run() {
	// Start the game tick timer (20Hz = 50ms)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	h.debugLog("Hub started, running at 20Hz (50ms per tick)")

	for {
		select {
		case client := <-h.Register:
			h.Clients[client] = true
			clientCount := len(h.Clients)
			log.Printf("Client connected: %s (total: %d)", client.ID, clientCount)
			h.debugLog("Client %s connected from, total clients: %d", client.ID, clientCount)

		case client := <-h.Unregister:
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.SendChan)
				clientCount := len(h.Clients)
				log.Printf("Client disconnected: %s (total: %d)", client.ID, clientCount)
				h.debugLog("Client %s disconnected, total clients: %d", client.ID, clientCount)
			}

		case message := <-h.Broadcast:
			recipientCount := 0
			for client := range h.Clients {
				select {
				case client.SendChan <- message:
					recipientCount++
				default:
					h.debugLog("Failed to send message to client %s, closing connection", client.ID)
					close(client.SendChan)
					delete(h.Clients, client)
				}
			}
			h.debugLog("Broadcast message to %d clients", recipientCount)

		case <-ticker.C:
			// Process game tick
			h.processGameTick()
		}
	}
}

// processGameTick creates a new game tick message and broadcasts it to all clients
func (h *Hub) processGameTick() {
	h.InputMutex.Lock()
	inputCount := len(h.CurrentInputs)

	// Create a tick message with all collected inputs
	tickMessage := types.TickMessage{
		Type: types.MessageTypeTick,
		Tick: types.GameTick{
			Tick:   h.CurrentTick,
			Inputs: h.CurrentInputs,
		},
	}

	// Debug log inputs for this tick
	if inputCount > 0 {
		h.debugLog("Tick %d: Processing %d inputs", h.CurrentTick, inputCount)
		for i, input := range h.CurrentInputs {
			inputJson, _ := json.Marshal(input)
			h.debugLog("  Input %d: %s", i, string(inputJson))
		}
	} else {
		h.debugLog("Tick %d: No inputs to process", h.CurrentTick)
	}

	// Reset inputs for the next tick
	h.CurrentInputs = make([]types.PlayerInput, 0)
	h.CurrentTick++
	h.InputMutex.Unlock()

	// Convert to JSON and broadcast
	message, err := encodeMessage(tickMessage)
	if err != nil {
		log.Printf("Error encoding tick message: %v", err)
		h.debugLog("Error encoding tick message: %v", err)
		return
	}

	select {
	case h.Broadcast <- message:
	default:
		h.debugLog("Failed to send message to broadcast channel")
	}
}

// AddInput adds a player input to the current tick
func (h *Hub) AddInput(input types.PlayerInput) {
	h.InputMutex.Lock()
	defer h.InputMutex.Unlock()

	h.debugLog("Received input from player %s: direction=%v, placeBlob=%v",
		input.PlayerID,
		input.Direction,
		input.PlaceBlob)

	h.CurrentInputs = append(h.CurrentInputs, input)
}
