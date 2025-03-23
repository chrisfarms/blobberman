package common

import (
	"sync"

	"github.com/chrisfarms/vibes/blobberman/backend/pkg/types"
)

// Hub interface defines the methods a hub should have
type Hub interface {
	AddInput(input types.PlayerInput)
}

// Client represents a connected WebSocket client
type Client struct {
	Hub      Hub
	ID       string
	SendChan chan ClientMessage
	Mutex    sync.Mutex
	DebugLog DebugLoggerFunc
}
