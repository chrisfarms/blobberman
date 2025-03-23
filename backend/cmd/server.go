package main

import (
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/chrisfarms/vibes/blobberman/backend/pkg/websocket"
)

var addr = flag.String("addr", ":8080", "http service address")
var verbose = flag.Bool("verbose", false, "enable verbose debug logging")
var tickInterval = flag.Int("tick-interval", 50, "tick interval in milliseconds (default: 50ms, which is 20Hz)")
var maxTicks = flag.Uint64("max-ticks", 100000, "maximum number of ticks in a game session (default: 100000 ticks, ~30 mins at 20Hz)")
var resetTimeout = flag.Int("reset-timeout", 30, "time in seconds to wait between game sessions (default: 30 seconds)")
var staticDir = flag.String("static-dir", "./public", "directory for serving static files (default: ./public)")

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

// spaHandler implements a handler for serving a Single Page Application
// It serves static files and falls back to index.html for other routes
// This allows for client-side routing in the SPA
type spaHandler struct {
	staticPath string
	indexPath  string
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Get the absolute path to prevent directory traversal attacks
	path, err := filepath.Abs(r.URL.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// If the path is the root or doesn't have an extension, serve index.html
	// This supports client-side routing
	if path == "/" {
		http.ServeFile(w, r, filepath.Join(h.staticPath, h.indexPath))
		return
	}

	// Check if file exists at the requested path
	requestedFile := filepath.Join(h.staticPath, path)
	_, err = os.Stat(requestedFile)
	if os.IsNotExist(err) {
		// File doesn't exist, serve index.html instead (for SPA client-side routing)
		http.ServeFile(w, r, filepath.Join(h.staticPath, h.indexPath))
		return
	} else if err != nil {
		// Some other error occurred
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// File exists, serve it directly
	http.FileServer(http.Dir(h.staticPath)).ServeHTTP(w, r)
}

func main() {
	flag.Parse()

	// Set up debug logger
	debugLog := newDebugLogger(*verbose)

	if *verbose {
		log.Printf("Verbose logging enabled")
		log.Printf("Tick interval: %dms", *tickInterval)
		log.Printf("Max ticks: %d", *maxTicks)
		log.Printf("Reset timeout: %d seconds", *resetTimeout)
		log.Printf("Static files directory: %s", *staticDir)
	}

	// Create options for the hub
	hubOptions := websocket.HubOptions{
		TickIntervalMs:  *tickInterval,
		MaxHistorySize:  *maxTicks,
		ResetTimeoutSec: *resetTimeout,
	}

	// Create a new hub with debug logger
	hub := websocket.NewHubWithOptions(hubOptions, debugLog.Printf)
	go hub.Run()

	// Create the API mux (for WebSocket and API endpoints)
	apiMux := http.NewServeMux()

	// Setup WebSocket handler
	apiMux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		remoteAddr := r.RemoteAddr
		debugLog.Printf("New websocket connection request from %s", remoteAddr)
		websocket.HandleWebSocketWithDebug(hub, w, r, debugLog.Printf)
	})

	// Add a simple health check endpoint
	apiMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	// Create the main mux
	mainMux := http.NewServeMux()

	// Mount API handlers to /api/ path
	mainMux.Handle("/ws", apiMux)
	mainMux.Handle("/health", apiMux)

	// Set up static file serving with SPA support
	spa := spaHandler{staticPath: *staticDir, indexPath: "index.html"}
	mainMux.Handle("/", spa)

	log.Printf("Starting server on %s", *addr)
	log.Printf("Serving static files from %s", *staticDir)
	err := http.ListenAndServe(*addr, mainMux)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
