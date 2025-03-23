package main

import (
	"flag"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/chrisfarms/vibes/blobberman/backend/pkg/websocket"
)

var addr = flag.String("addr", ":8080", "http service address")
var verbose = flag.Bool("verbose", false, "enable verbose debug logging")

// debugLogger is a logger that only logs when verbose mode is enabled
type debugLogger struct {
	logger  *log.Logger
	enabled bool
}

// newDebugLogger creates a new debug logger
func newDebugLogger(enabled bool) *debugLogger {
	var logger *log.Logger
	if enabled {
		logger = log.New(os.Stdout, "[DEBUG] ", log.LstdFlags)
	} else {
		logger = log.New(io.Discard, "", 0)
	}
	return &debugLogger{
		logger:  logger,
		enabled: enabled,
	}
}

// Printf prints debug messages if verbose is enabled
func (d *debugLogger) Printf(format string, args ...interface{}) {
	if d.enabled {
		d.logger.Printf(format, args...)
	}
}

func main() {
	flag.Parse()

	// Set up debug logger
	debugLog := newDebugLogger(*verbose)

	if *verbose {
		log.Printf("Verbose logging enabled")
	}

	// Create a new hub with debug logger
	hub := websocket.NewHubWithDebug(debugLog.Printf)
	go hub.Run()

	// Setup WebSocket handler
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		remoteAddr := r.RemoteAddr
		debugLog.Printf("New websocket connection request from %s", remoteAddr)
		websocket.HandleWebSocketWithDebug(hub, w, r, debugLog.Printf)
	})

	// Add a simple health check endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	log.Printf("Starting server on %s", *addr)
	err := http.ListenAndServe(*addr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
