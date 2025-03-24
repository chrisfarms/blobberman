package types

// Direction represents a movement direction
type Direction string

const (
	DirectionUp    Direction = "up"
	DirectionDown  Direction = "down"
	DirectionLeft  Direction = "left"
	DirectionRight Direction = "right"
)

// PlayerInput represents a single player's input for a game tick
type PlayerInput struct {
	PlayerID  string `json:"playerId"`
	Up        bool   `json:"up"`
	Down      bool   `json:"down"`
	Left      bool   `json:"left"`
	Right     bool   `json:"right"`
	PlaceBlob bool   `json:"placeBlob"`
}

// GameTick represents a single tick of the game with all player inputs
type GameTick struct {
	Tick   uint64        `json:"tick"`
	Inputs []PlayerInput `json:"inputs"`
}

// MessageType defines the type of message being sent
type MessageType string

const (
	MessageTypeConnect     MessageType = "connect"
	MessageTypeInput       MessageType = "input"
	MessageTypeTick        MessageType = "tick"
	MessageTypeHistorySync MessageType = "historySync"
	MessageTypeReset       MessageType = "reset"
	MessageTypeDisplayName MessageType = "displayName"
	MessageTypeClientId    MessageType = "clientId"
)

// ConnectMessage is sent when a player connects to the game
type ConnectMessage struct {
	Type         MessageType `json:"type"`
	PlayerID     string      `json:"playerId"`
	MaxTicks     uint64      `json:"maxTicks"`     // Maximum number of ticks in the game session
	TickInterval int         `json:"tickInterval"` // Milliseconds between ticks
}

// GetType returns the message type
func (m ConnectMessage) GetType() MessageType {
	return m.Type
}

// InputMessage is sent when a player submits input
type InputMessage struct {
	Type  MessageType `json:"type"`
	Input PlayerInput `json:"input"`
}

// GetType returns the message type
func (m InputMessage) GetType() MessageType {
	return m.Type
}

// TickMessage is sent to all clients at regular intervals
type TickMessage struct {
	Type MessageType `json:"type"`
	Tick GameTick    `json:"tick"`
}

// GetType returns the message type
func (m TickMessage) GetType() MessageType {
	return m.Type
}

// HistorySyncMessage is sent to new clients to catch them up with the game state
type HistorySyncMessage struct {
	Type     MessageType `json:"type"`
	History  []GameTick  `json:"history"`
	FromTick uint64      `json:"fromTick"`
	ToTick   uint64      `json:"toTick"`
}

// GetType returns the message type
func (m HistorySyncMessage) GetType() MessageType {
	return m.Type
}

// ResetMessage is sent to all clients when a game session is about to reset
type ResetMessage struct {
	Type         MessageType `json:"type"`
	ResetTimeSec int         `json:"resetTimeSec"` // Seconds until reset happens
	CountdownSec int         `json:"countdownSec"` // Current countdown seconds remaining
}

// GetType returns the message type
func (m ResetMessage) GetType() MessageType {
	return m.Type
}

// DisplayNameMessage is sent when a player updates their display name
type DisplayNameMessage struct {
	Type        MessageType `json:"type"`
	PlayerID    string      `json:"playerId"`
	DisplayName string      `json:"displayName"`
}

// GetType returns the message type
func (m DisplayNameMessage) GetType() MessageType {
	return m.Type
}

// DisplayNameUpdateMessage is broadcast when any player updates their display name
type DisplayNameUpdateMessage struct {
	Type         MessageType       `json:"type"`
	DisplayNames map[string]string `json:"displayNames"` // Map of player IDs to display names
}

// GetType returns the message type
func (m DisplayNameUpdateMessage) GetType() MessageType {
	return m.Type
}

// ClientIdMessage is sent by the client to provide its persistent player ID
type ClientIdMessage struct {
	Type     MessageType `json:"type"`
	PlayerID string      `json:"playerId"`
}

// GetType returns the message type
func (m ClientIdMessage) GetType() MessageType {
	return m.Type
}
