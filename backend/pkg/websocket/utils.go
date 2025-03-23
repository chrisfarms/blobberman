package websocket

import (
	"encoding/json"
	"fmt"
)

// encodeMessage marshals a message to JSON
func encodeMessage(message interface{}) ([]byte, error) {
	data, err := json.Marshal(message)
	if err != nil {
		return nil, fmt.Errorf("error marshalling message: %w", err)
	}
	return data, nil
}
