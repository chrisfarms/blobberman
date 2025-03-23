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
	TickIntervalMs  int
	MaxHistorySize  uint64
	ResetTimeoutSec int // Time in seconds to wait before starting a new game session after game over
}

// Hub manages WebSocket client connections and game state
type Hub struct {
	// Registered clients
	Clients map[*common.Client]bool

	// Mutex to protect Clients map
	ClientsMutex sync.Mutex

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

	// Display names of players
	DisplayNames map[string]string

	// Mutex to protect display names access
	DisplayNamesMutex sync.Mutex

	// Debug logger function
	debugLog common.DebugLoggerFunc

	// Tick interval in milliseconds
	tickInterval int

	// Maximum number of ticks to keep in history
	maxHistorySize uint64

	// Game session reset handling
	resetTimer      *time.Timer
	isResetting     bool
	resetTimeoutSec int
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
	// Set default reset timeout if not specified
	resetTimeout := options.ResetTimeoutSec
	if resetTimeout <= 0 {
		resetTimeout = 30 // Default to 30 seconds
	}

	return &Hub{
		Clients:           make(map[*common.Client]bool),
		ClientsMutex:      sync.Mutex{},
		Register:          make(chan *common.Client),
		Unregister:        make(chan *common.Client),
		Broadcast:         make(chan common.ClientMessage, 1),
		CurrentTick:       0,
		CurrentInputs:     make([]types.PlayerInput, 0),
		TickHistory:       make([]types.GameTick, 0, options.MaxHistorySize),
		DisplayNames:      make(map[string]string),
		DisplayNamesMutex: sync.Mutex{},
		debugLog:          debugLog,
		tickInterval:      options.TickIntervalMs,
		maxHistorySize:    options.MaxHistorySize,
		resetTimeoutSec:   resetTimeout, // Use the provided or default reset timeout
		isResetting:       false,
	}
}

// Run starts the hub, processing client connections and game ticks
func (h *Hub) Run() {
	// Start the game tick timer with the configured interval
	ticker := time.NewTicker(time.Duration(h.tickInterval) * time.Millisecond)
	defer ticker.Stop()

	// Create a nil channel for the reset timer
	var resetChan <-chan time.Time

	h.debugLog("Hub started, running at %dms per tick", h.tickInterval)

	for {
		select {
		case client := <-h.Register:
			h.ClientsMutex.Lock()
			h.Clients[client] = true
			clientCount := len(h.Clients)
			h.ClientsMutex.Unlock()

			log.Printf("Client connected: %s (total: %d)", client.ID, clientCount)
			h.debugLog("Client %s connected from, total clients: %d", client.ID, clientCount)

			// Send connection message with game session information
			connectMsg := types.ConnectMessage{
				Type:         types.MessageTypeConnect,
				PlayerID:     client.ID, // This is initially a temporary ID
				MaxTicks:     h.maxHistorySize,
				TickInterval: h.tickInterval,
			}

			select {
			case client.SendChan <- connectMsg:
				h.debugLog("Connect message sent to client %s", client.ID)
			default:
				h.debugLog("Failed to send connect message to client %s", client.ID)
			}

			// We won't send history yet - we'll wait for the client to send their ID first
			// The client handler will send history after receiving the client ID

		case client := <-h.Unregister:
			h.ClientsMutex.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.SendChan)
				clientCount := len(h.Clients)
				log.Printf("Client disconnected: %s (total: %d)", client.ID, clientCount)
				h.debugLog("Client %s disconnected, total clients: %d", client.ID, clientCount)
			}
			h.ClientsMutex.Unlock()

		case message := <-h.Broadcast:
			h.ClientsMutex.Lock()

			// Create a copy of the client map to avoid concurrent modification
			clients := make(map[*common.Client]bool, len(h.Clients))
			for client := range h.Clients {
				clients[client] = true
			}

			h.ClientsMutex.Unlock()

			recipientCount := 0
			clientsToRemove := make([]*common.Client, 0)

			// Send to all clients
			for client := range clients {
				select {
				case client.SendChan <- message:
					recipientCount++
				default:
					h.debugLog("Failed to send message to client %s, marking for removal", client.ID)
					clientsToRemove = append(clientsToRemove, client)
				}
			}

			// Now remove any clients that failed
			if len(clientsToRemove) > 0 {
				h.ClientsMutex.Lock()
				for _, client := range clientsToRemove {
					if _, ok := h.Clients[client]; ok {
						delete(h.Clients, client)
						close(client.SendChan)
					}
				}
				h.ClientsMutex.Unlock()
			}

			h.debugLog("Broadcast message of type %s to %d clients", message.GetType(), recipientCount)

		case <-ticker.C:
			// Process game tick
			h.processGameTick()

		case <-resetChan:
			// Reset the game session
			h.resetGameSession()
			// Clear the channel
			resetChan = nil
		}

		// Update resetChan if timer is created but channel isn't set
		if h.resetTimer != nil && resetChan == nil {
			resetChan = h.resetTimer.C
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

	// Check if we need to start reset countdown when game is over
	// Game is over when we reach max ticks
	if !h.isResetting && h.CurrentTick > 0 && h.CurrentTick >= h.maxHistorySize {
		h.startResetCountdown()
	}

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

// startResetCountdown begins the countdown to reset the game session
func (h *Hub) startResetCountdown() {
	h.isResetting = true
	h.debugLog("Starting reset countdown (%d seconds)", h.resetTimeoutSec)

	// Stop any existing timer first
	if h.resetTimer != nil {
		h.resetTimer.Stop()
	}

	// Create reset timer
	h.resetTimer = time.NewTimer(time.Duration(h.resetTimeoutSec) * time.Second)

	// Start sending countdown messages
	go h.broadcastCountdown()
}

// broadcastCountdown sends countdown updates to all clients
func (h *Hub) broadcastCountdown() {
	// Send countdown messages every second
	for countdown := h.resetTimeoutSec; countdown >= 0; countdown-- {
		resetMsg := types.ResetMessage{
			Type:         types.MessageTypeReset,
			ResetTimeSec: h.resetTimeoutSec,
			CountdownSec: countdown,
		}

		// Broadcast countdown message
		select {
		case h.Broadcast <- resetMsg:
			h.debugLog("Broadcast reset countdown: %d seconds remaining", countdown)
		default:
			h.debugLog("Failed to broadcast countdown message")
		}

		// Wait 1 second between updates
		if countdown > 0 {
			time.Sleep(1 * time.Second)
		}
	}
}

// resetGameSession resets the game to start a new session
func (h *Hub) resetGameSession() {
	h.InputMutex.Lock()
	defer h.InputMutex.Unlock()

	h.debugLog("Resetting game session")

	// Reset game state
	h.CurrentTick = 0
	h.CurrentInputs = make([]types.PlayerInput, 0)
	h.TickHistory = make([]types.GameTick, 0, h.maxHistorySize)
	h.isResetting = false

	// Clean up the reset timer to avoid issues with subsequent resets
	if h.resetTimer != nil {
		h.resetTimer.Stop()
		h.resetTimer = nil
	}

	// Get a copy of the clients to broadcast to
	h.ClientsMutex.Lock()
	clients := make([]*common.Client, 0, len(h.Clients))
	for client := range h.Clients {
		clients = append(clients, client)
	}
	h.ClientsMutex.Unlock()

	// Broadcast a new connect message to all clients to reset their states
	for _, client := range clients {
		// Send updated connection message with game session information
		connectMsg := types.ConnectMessage{
			Type:         types.MessageTypeConnect,
			PlayerID:     client.ID,
			MaxTicks:     h.maxHistorySize,
			TickInterval: h.tickInterval,
		}

		select {
		case client.SendChan <- connectMsg:
			h.debugLog("Reset message sent to client %s", client.ID)
		default:
			h.debugLog("Failed to send reset message to client %s", client.ID)
		}
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

// UpdateDisplayName updates a player's display name and broadcasts it to all clients
func (h *Hub) UpdateDisplayName(playerID string, displayName string) {
	h.DisplayNamesMutex.Lock()
	h.DisplayNames[playerID] = displayName
	h.DisplayNamesMutex.Unlock()
	h.debugLog("Updated display name for player %s: %s", playerID, displayName)

	// Broadcast updated display names to all clients
	h.broadcastDisplayNames()
}

// broadcastDisplayNames broadcasts the current display names to all clients
func (h *Hub) broadcastDisplayNames() {
	// Get a lock to make a copy of the display names
	h.DisplayNamesMutex.Lock()

	// Create a copy of the display names map to avoid concurrent map access
	displayNamesCopy := make(map[string]string, len(h.DisplayNames))
	for id, name := range h.DisplayNames {
		displayNamesCopy[id] = name
	}

	h.DisplayNamesMutex.Unlock()

	// Create a display name update message using the copied map
	displayNameMsg := types.DisplayNameUpdateMessage{
		Type:         types.MessageTypeDisplayName,
		DisplayNames: displayNamesCopy,
	}

	// Broadcast the message
	select {
	case h.Broadcast <- displayNameMsg:
		h.debugLog("Broadcast display names update to clients")
	default:
		h.debugLog("Failed to broadcast display names update")
	}
}

// SendDisplayNamesToClient sends the current display names to a single client
func (h *Hub) SendDisplayNamesToClient(client *common.Client) {
	h.DisplayNamesMutex.Lock()

	// Skip if there are no display names
	if len(h.DisplayNames) == 0 {
		h.DisplayNamesMutex.Unlock()
		return
	}

	// Create a copy of the display names map to avoid concurrent access
	displayNamesCopy := make(map[string]string, len(h.DisplayNames))
	for id, name := range h.DisplayNames {
		displayNamesCopy[id] = name
	}

	h.DisplayNamesMutex.Unlock()

	// Create a display name update message
	displayNameMsg := types.DisplayNameUpdateMessage{
		Type:         types.MessageTypeDisplayName,
		DisplayNames: displayNamesCopy,
	}

	// Send the message directly to the client
	select {
	case client.SendChan <- displayNameMsg:
		h.debugLog("Sent display names to client %s", client.ID)
	default:
		h.debugLog("Failed to send display names to client %s", client.ID)
	}
}

// UpdateClientId updates a client's ID and transfers any associated data
func (h *Hub) UpdateClientId(oldId string, newId string) {
	h.debugLog("Updating client ID in hub: %s -> %s", oldId, newId)

	// Transfer display name if it exists
	h.DisplayNamesMutex.Lock()
	if displayName, exists := h.DisplayNames[oldId]; exists {
		h.DisplayNames[newId] = displayName
		delete(h.DisplayNames, oldId)
		h.debugLog("Transferred display name for %s to %s", oldId, newId)
	}
	h.DisplayNamesMutex.Unlock()

	// Note: We don't need to transfer player state from the game state
	// as that will be rebuilt by the client based on game history and ticks
}
