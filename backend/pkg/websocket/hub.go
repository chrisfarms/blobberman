package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/chrisfarms/vibes/blobberman/backend/pkg/types"
	"github.com/chrisfarms/vibes/blobberman/backend/pkg/websocket/common"
)

// Maximum number of ticks to keep in history
const DEFAULT_MAX_HISTORY_SIZE = 100_000 // about 30mins of history
const DEFAULT_TICK_INTERVAL_MS = 50      // 50ms per tick (20Hz)

// DebugLoggerFunc is a function type for debug logging
type DebugLoggerFunc func(format string, args ...interface{})

// noopDebugLogger is a no-op debug logger
func noopDebugLogger(format string, args ...interface{}) {}

// ClientMessage is a type that can be sent to clients
type ClientMessage interface {
	GetType() types.MessageType
}

// Client represents a connected WebSocket client
type Client struct {
	Hub      *Hub
	ID       string
	SendChan chan ClientMessage
	Mutex    sync.Mutex
	debugLog DebugLoggerFunc
}

// HubOptions contains configurable options for the Hub
type HubOptions struct {
	TickIntervalMs int
	MaxHistorySize uint64
}

// Hub manages WebSocket client connections and game state
type Hub struct {
	// Registered clients
	Clients map[*common.Client]bool

	// Channel for registering clients
	Register chan *common.Client

	// Channel for unregistering clients
	Unregister chan *common.Client

	// Channel for broadcasting messages to all clients
	Broadcast chan common.ClientMessage

	// Current game tick
	CurrentTick uint64

	// Inputs received for the current tick
	CurrentInputs []types.PlayerInput

	// History of past ticks
	TickHistory []types.GameTick

	// Mutex to protect input access
	InputMutex sync.Mutex

	// Debug logger function
	debugLog common.DebugLoggerFunc

	// Tick interval in milliseconds
	tickInterval int

	// Maximum number of ticks to keep in history
	maxHistorySize uint64
}

// NewHub creates a new Hub instance with default no-op logger and default options
func NewHub() *Hub {
	return NewHubWithOptions(HubOptions{
		TickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
		MaxHistorySize: DEFAULT_MAX_HISTORY_SIZE,
	}, common.NoopDebugLogger)
}

// NewHubWithDebug creates a new Hub instance with the provided debug logger and default options
func NewHubWithDebug(debugLog common.DebugLoggerFunc) *Hub {
	return NewHubWithOptions(HubOptions{
		TickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
		MaxHistorySize: DEFAULT_MAX_HISTORY_SIZE,
	}, debugLog)
}

// NewHubWithOptions creates a new Hub instance with the provided options and debug logger
func NewHubWithOptions(options HubOptions, debugLog common.DebugLoggerFunc) *Hub {
	return &Hub{
		Clients:        make(map[*common.Client]bool),
		Register:       make(chan *common.Client),
		Unregister:     make(chan *common.Client),
		Broadcast:      make(chan common.ClientMessage, 1),
		CurrentTick:    0,
		CurrentInputs:  make([]types.PlayerInput, 0),
		TickHistory:    make([]types.GameTick, 0, options.MaxHistorySize),
		debugLog:       debugLog,
		tickInterval:   options.TickIntervalMs,
		maxHistorySize: options.MaxHistorySize,
	}
}

// Run starts the hub, processing client connections and game ticks
func (h *Hub) Run() {
	// Start the game tick timer with the configured interval
	ticker := time.NewTicker(time.Duration(h.tickInterval) * time.Millisecond)
	defer ticker.Stop()

	h.debugLog("Hub started, running at %dms per tick", h.tickInterval)

	for {
		select {
		case client := <-h.Register:
			h.Clients[client] = true
			clientCount := len(h.Clients)
			log.Printf("Client connected: %s (total: %d)", client.ID, clientCount)
			h.debugLog("Client %s connected from, total clients: %d", client.ID, clientCount)

			// Send connection message with game session information
			connectMsg := types.ConnectMessage{
				Type:         types.MessageTypeConnect,
				PlayerID:     client.ID,
				MaxTicks:     h.maxHistorySize,
				TickInterval: h.tickInterval,
			}

			select {
			case client.SendChan <- connectMsg:
				h.debugLog("Connect message sent to client %s", client.ID)
			default:
				h.debugLog("Failed to send connect message to client %s", client.ID)
			}

			// Send history to the new client if we have any
			h.sendHistoryToClient(client)

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
			h.debugLog("Broadcast message of type %s to %d clients", message.GetType(), recipientCount)

		case <-ticker.C:
			// Process game tick
			h.processGameTick()
		}
	}
}

// sendHistoryToClient sends the game history to a newly connected client
func (h *Hub) sendHistoryToClient(client *common.Client) {
	h.InputMutex.Lock()
	defer h.InputMutex.Unlock()

	historyLength := len(h.TickHistory)
	if historyLength == 0 {
		h.debugLog("No history to send to client %s", client.ID)
		return
	}

	// Create a history sync message
	historyMsg := types.HistorySyncMessage{
		Type:     types.MessageTypeHistorySync,
		History:  h.TickHistory,
		FromTick: h.TickHistory[0].Tick,
		ToTick:   h.TickHistory[historyLength-1].Tick,
	}

	h.debugLog("Sending history to client %s (ticks %d to %d, %d total ticks)",
		client.ID, historyMsg.FromTick, historyMsg.ToTick, historyLength)

	// Send the message directly
	select {
	case client.SendChan <- historyMsg:
		h.debugLog("History message sent to client %s", client.ID)
	default:
		h.debugLog("Failed to send history message to client %s", client.ID)
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

	// Add the current tick to history
	if uint64(len(h.TickHistory)) >= h.maxHistorySize {
		// If history is full, remove the oldest tick
		h.TickHistory = h.TickHistory[1:]
	}
	h.TickHistory = append(h.TickHistory, tickMessage.Tick)

	// Reset inputs for the next tick
	h.CurrentInputs = make([]types.PlayerInput, 0)
	h.CurrentTick++
	h.InputMutex.Unlock()

	// Broadcast the tick message directly
	select {
	case h.Broadcast <- tickMessage:
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
