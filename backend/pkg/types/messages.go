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
	PlayerID  string     `json:"playerId"`
	Direction *Direction `json:"direction"`
	PlaceBlob bool       `json:"placeBlob"`
}

// GameTick represents a single tick of the game with all player inputs
type GameTick struct {
	Tick   uint64        `json:"tick"`
	Inputs []PlayerInput `json:"inputs"`
}

// MessageType defines the type of message being sent
type MessageType string

const (
	MessageTypeConnect MessageType = "connect"
	MessageTypeInput   MessageType = "input"
	MessageTypeTick    MessageType = "tick"
)

// ConnectMessage is sent when a player connects to the game
type ConnectMessage struct {
	Type     MessageType `json:"type"`
	PlayerID string      `json:"playerId"`
}

// InputMessage is sent when a player submits input
type InputMessage struct {
	Type  MessageType `json:"type"`
	Input PlayerInput `json:"input"`
}

// TickMessage is sent to all clients at regular intervals
type TickMessage struct {
	Type MessageType `json:"type"`
	Tick GameTick    `json:"tick"`
}
