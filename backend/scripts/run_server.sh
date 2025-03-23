#!/bin/bash

# Script to start the Blobberman server with different configuration presets

# Default values
ADDR=":8080"
VERBOSE=""
TICK_INTERVAL="50"
MAX_TICKS="100000"

function show_help() {
  echo "Usage: $0 [options] [preset]"
  echo ""
  echo "Options:"
  echo "  -h, --help     Show this help message"
  echo ""
  echo "Presets:"
  echo "  default        Default configuration"
  echo "  quick          Quick game"
  echo "  slow           Slow game"
  echo "  fast           Fast game"
  echo "  test           Test game"
  echo ""
  echo "Examples:"
  echo "  $0                  # Default: 20Hz, ~30 mins"
  echo "  $0 quick           # Quick game: 20Hz, 5 mins"
  echo "  $0 test            # Test game: 20Hz, 1 min"
  exit 0
}

# Parse command line arguments
if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
  show_help
fi

# Set preset configurations
case "$1" in
  "quick")
    MAX_TICKS="2000"
    RESET_TIMEOUT="10"
    echo "Setting up a quick game"
    ;;
  "slow")
    MAX_TICKS="8000"
    TICK_INTERVAL="100"
    echo "Setting up a slow game"
    ;;
  "fast")
    MAX_TICKS="1000"
    RESET_TIMEOUT="5"
    echo "Setting up a fast game"
    ;;
  "test")
    MAX_TICKS="500"
    VERBOSE="-verbose"
    RESET_TIMEOUT="5"
    echo "Setting up a test game"
    ;;
  "default" | "")
    echo "Setting up a default game (20Hz, ~30 mins)"
    ;;
  *)
    echo "Unknown preset: $1"
    show_help
    ;;
esac

# Build and run the server
cd "$(dirname "$0")/.."
echo "Building server..."
go build -o server cmd/server.go
echo "Starting server with: -addr $ADDR -tick-interval $TICK_INTERVAL -max-ticks $MAX_TICKS $VERBOSE -reset-timeout $RESET_TIMEOUT"
./server -addr $ADDR -tick-interval $TICK_INTERVAL -max-ticks $MAX_TICKS $VERBOSE -reset-timeout $RESET_TIMEOUT
