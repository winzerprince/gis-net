#!/bin/bash

# ===================================================
# GIS-NET Development Startup Script
# Starts Frontend and Backend in Separate Terminal Sessions
# ===================================================
#
# This script launches the development environment by:
# 1. Starting the backend API server in a new terminal
# 2. Starting the frontend React app in another terminal
# 3. Optionally starting a local PostgreSQL database
#
# USAGE:
#   ./dev-start.sh              # Start frontend and backend
#   ./dev-start.sh --db         # Also start database setup
#   ./dev-start.sh --help       # Show usage information
#
# REQUIREMENTS:
#   - Node.js 18+ installed
#   - npm packages installed in both frontend/ and backend/
#   - PostgreSQL installed locally (optional)
#   - Terminal emulator that supports gnome-terminal or xterm

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project paths
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Logging function
log() {
    echo -e "${GREEN}[GIS-NET]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if directory exists
check_directory() {
    if [ ! -d "$1" ]; then
        error "Directory not found: $1"
        exit 1
    fi
}

# Check if node_modules exists
check_dependencies() {
    local dir=$1
    local name=$2
    
    if [ ! -d "$dir/node_modules" ]; then
        warn "$name dependencies not found. Installing..."
        cd "$dir"
        npm install
        cd "$PROJECT_ROOT"
    fi
}

# Function to detect available terminal emulator
detect_terminal() {
    if command -v gnome-terminal &> /dev/null; then
        echo "gnome-terminal"
    elif command -v xterm &> /dev/null; then
        echo "xterm"
    elif command -v konsole &> /dev/null; then
        echo "konsole"
    elif command -v terminator &> /dev/null; then
        echo "terminator"
    else
        echo "none"
    fi
}

# Function to start backend
start_backend() {
    log "Starting backend server..."
    # Avoid duplicate instances if port is already in use
    if lsof -i :4000 >/dev/null 2>&1; then
        warn "Backend port 4000 is already in use. Skipping backend start."
        return 0
    fi

    local terminal=$(detect_terminal)
    case $terminal in
        "gnome-terminal")
            gnome-terminal --tab --title="GIS-NET Backend" -- bash -c "cd '$BACKEND_DIR' && echo -e '${BLUE}Starting GIS-NET Backend API Server${NC}' && npm run dev; exec bash"
            ;;
        "xterm")
            xterm -T "GIS-NET Backend" -e "cd '$BACKEND_DIR' && echo 'Starting GIS-NET Backend API Server' && npm run dev; bash" &
            ;;
        "konsole")
            konsole --new-tab --title "GIS-NET Backend" -e bash -c "cd '$BACKEND_DIR' && echo 'Starting GIS-NET Backend API Server' && npm run dev; exec bash" &
            ;;
        "terminator")
            terminator --new-tab --title="GIS-NET Backend" -x bash -c "cd '$BACKEND_DIR' && echo 'Starting GIS-NET Backend API Server' && npm run dev; exec bash" &
            ;;
        *)
            warn "No supported terminal emulator found. Starting backend in current terminal..."
            # Start in background to not block current terminal
            (cd "$BACKEND_DIR" && nohup npm run dev >/tmp/gis-net-backend.log 2>&1 & disown) || true
            echo "Backend started in background. Logs: /tmp/gis-net-backend.log"
            ;;
    esac
}

# Function to start frontend
start_frontend() {
    log "Starting frontend development server..."
    # Avoid duplicate instances if port is already in use
    if lsof -i :3000 >/dev/null 2>&1; then
        warn "Frontend port 3000 is already in use. Skipping frontend start."
        return 0
    fi

    local terminal=$(detect_terminal)
    case $terminal in
        "gnome-terminal")
            gnome-terminal --tab --title="GIS-NET Frontend" -- bash -c "cd '$FRONTEND_DIR' && echo -e '${BLUE}Starting GIS-NET React Development Server${NC}' && npm start; exec bash"
            ;;
        "xterm")
            xterm -T "GIS-NET Frontend" -e "cd '$FRONTEND_DIR' && echo 'Starting GIS-NET React Development Server' && npm start; bash" &
            ;;
        "konsole")
            konsole --new-tab --title "GIS-NET Frontend" -e bash -c "cd '$FRONTEND_DIR' && echo 'Starting GIS-NET React Development Server' && npm start; exec bash" &
            ;;
        "terminator")
            terminator --new-tab --title="GIS-NET Frontend" -x bash -c "cd '$FRONTEND_DIR' && echo 'Starting GIS-NET React Development Server' && npm start; exec bash" &
            ;;
        *)
            warn "No supported terminal emulator found. Starting frontend in current terminal..."
            # Start in background to not block current terminal
            (cd "$FRONTEND_DIR" && nohup npm start >/tmp/gis-net-frontend.log 2>&1 & disown) || true
            echo "Frontend started in background. Logs: /tmp/gis-net-frontend.log"
            ;;
    esac
}

# Function to setup database
setup_database() {
    log "Setting up PostgreSQL database..."
    
    # Check if PostgreSQL is running
    if ! pgrep -x "postgres" > /dev/null; then
        warn "PostgreSQL is not running. Attempting to start..."
        if command -v systemctl &> /dev/null; then
            sudo systemctl start postgresql
        elif command -v brew &> /dev/null; then
            brew services start postgresql
        else
            warn "Please start PostgreSQL manually"
            return 1
        fi
    fi
    
    # Create database if it doesn't exist
    local db_name="gisnet_dev"
    if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$db_name"; then
        log "Creating database: $db_name"
        createdb -U postgres "$db_name" || {
            warn "Could not create database. You may need to:"
            echo "  1. Start PostgreSQL service"
            echo "  2. Create the database manually: createdb $db_name"
            echo "  3. Update backend/.env with correct DATABASE_URL"
        }
    else
        log "Database $db_name already exists"
    fi
}

# Function to show help
show_help() {
    echo "GIS-NET Development Startup Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --help          Show this help message"
    echo "  --db            Also setup/start PostgreSQL database"
    echo "  --backend-only  Start only the backend server"
    echo "  --frontend-only Start only the frontend server"
    echo "  --check         Check system requirements"
    echo ""
    echo "Examples:"
    echo "  $0                    # Start both frontend and backend"
    echo "  $0 --db              # Start both services and setup database"
    echo "  $0 --backend-only     # Start only backend"
    echo "  $0 --frontend-only    # Start only frontend"
}

# Function to check system requirements
check_requirements() {
    log "Checking system requirements..."
    
    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        log "Node.js: $node_version"
        
        # Check if version is 18 or higher
        local major_version=$(echo $node_version | cut -d'.' -f1 | sed 's/v//')
        if [ "$major_version" -lt 18 ]; then
            warn "Node.js version 18+ recommended. Current: $node_version"
        fi
    else
        error "Node.js not found. Please install Node.js 18+"
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        log "npm: $npm_version"
    else
        error "npm not found. Please install npm"
        exit 1
    fi
    
    # Check PostgreSQL (optional)
    if command -v psql &> /dev/null; then
        local pg_version=$(psql --version | head -n1)
        log "PostgreSQL: $pg_version"
    else
        warn "PostgreSQL not found. Database features may not work"
    fi
    
    # Check terminal emulator
    local terminal=$(detect_terminal)
    if [ "$terminal" != "none" ]; then
        log "Terminal: $terminal"
    else
        warn "No supported terminal emulator found"
        warn "Supported: gnome-terminal, xterm, konsole, terminator"
    fi
    
    log "System requirements check completed"
}

# Main execution
main() {
    log "Starting GIS-NET Development Environment"
    
    # Parse command line arguments
    case "${1:-}" in
        --help)
            show_help
            exit 0
            ;;
        --check)
            check_requirements
            exit 0
            ;;
        --db)
            setup_database
            ;;
        --backend-only)
            check_directory "$BACKEND_DIR"
            check_dependencies "$BACKEND_DIR" "Backend"
            start_backend
            log "Backend server started. Check the new terminal tab."
            exit 0
            ;;
        --frontend-only)
            check_directory "$FRONTEND_DIR"
            check_dependencies "$FRONTEND_DIR" "Frontend"
            start_frontend
            log "Frontend server started. Check the new terminal tab."
            exit 0
            ;;
        "")
            # Default: start both services
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
    
    # Verify directories exist
    check_directory "$BACKEND_DIR"
    check_directory "$FRONTEND_DIR"
    
    # Check and install dependencies
    check_dependencies "$BACKEND_DIR" "Backend"
    check_dependencies "$FRONTEND_DIR" "Frontend"
    
    # Start services
    start_backend
    sleep 2  # Give backend time to start
    start_frontend
    
    log "Development servers are starting..."
    echo ""
    echo -e "${BLUE}Backend API:${NC}  http://localhost:4000"
    echo -e "${BLUE}Frontend App:${NC} http://localhost:3000"
    echo ""
    echo -e "${YELLOW}Check the new terminal tabs for server output${NC}"
    echo -e "${YELLOW}Press Ctrl+C in each terminal to stop the servers${NC}"
}

# Run main function with all arguments
main "$@"
