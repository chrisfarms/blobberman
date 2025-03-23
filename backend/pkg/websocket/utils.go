package websocket

import (
	"encoding/json"
)

// encodeMessage converts any struct to a JSON byte array
func encodeMessage(message interface{}) ([]byte, error) {
	return json.Marshal(message)
}

// decodeMessage decodes a JSON byte array into the given struct
func decodeMessage(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}
