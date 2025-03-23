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
  echo "  default        Default configuration (20Hz, ~30 mins)"
  echo "  quick          Quick game (20Hz, 5 mins)"
  echo "  slow           Slow game (10Hz, ~30 mins)"
  echo "  fast           Fast game (20Hz, ~5 mins)"
  echo "  test           Test game (20Hz, 1 min)"
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
    MAX_TICKS="6000"  # 5 minutes at 20Hz
    echo "Setting up a quick game (20Hz, 5 mins)"
    ;;
  "slow")
    TICK_INTERVAL="100"  # 10Hz
    echo "Setting up a slow game (10Hz, ~30 mins)"
    ;;
  "fast")
    MAX_TICKS="1000"  # 1 minute at 20Hz
    echo "Setting up a fast game (40Hz, ~30 mins)"
    ;;
  "test")
    MAX_TICKS="1200"  # 1 minute at 20Hz
    VERBOSE="-verbose"
    echo "Setting up a test game (20Hz, 1 min)"
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
echo "Starting server with: -addr $ADDR -tick-interval $TICK_INTERVAL -max-ticks $MAX_TICKS $VERBOSE"
./server -addr $ADDR -tick-interval $TICK_INTERVAL -max-ticks $MAX_TICKS $VERBOSE
