package common

import "github.com/chrisfarms/vibes/blobberman/backend/pkg/types"

// ClientMessage is a type that can be sent to clients
type ClientMessage interface {
	GetType() types.MessageType
}

// DebugLoggerFunc is a function type for debug logging
type DebugLoggerFunc func(format string, args ...interface{})

// NoopDebugLogger is a no-op debug logger
func NoopDebugLogger(format string, args ...interface{}) {}
