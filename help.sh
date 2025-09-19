#!/bin/bash

# ===================================================
# GIS-NET Development Helper
# Shows all available development commands
# ===================================================

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}🗺️  GIS-NET Development Helper${NC}"
echo -e "${CYAN}================================${NC}"
echo ""

echo -e "${BOLD}🚀 Quick Start Commands:${NC}"
echo -e "${GREEN}  ./dev-start.sh${NC}                    Start both services (separate terminals)"
echo -e "${GREEN}  ./dev-concurrent.sh${NC}               Start both services (same terminal)"
echo -e "${GREEN}  npm run dev${NC}                      Start both services (npm script)"
echo ""

echo -e "${BOLD}🔧 Individual Services:${NC}"
echo -e "${BLUE}  ./dev-start.sh --backend-only${NC}     Start only backend API"
echo -e "${BLUE}  ./dev-start.sh --frontend-only${NC}    Start only frontend"
echo -e "${BLUE}  npm run dev:backend${NC}              Start backend (npm)"
echo -e "${BLUE}  npm run dev:frontend${NC}             Start frontend (npm)"
echo ""

echo -e "${BOLD}🛠️  Management Commands:${NC}"
echo -e "${YELLOW}  ./status.sh${NC}                      Check service status"
echo -e "${YELLOW}  ./dev-start.sh --check${NC}           Check system requirements"
echo -e "${YELLOW}  npm run setup${NC}                   Install all dependencies"
echo -e "${YELLOW}  npm run clean${NC}                   Clean all node_modules"
echo ""

echo -e "${BOLD}🧪 Testing & Building:${NC}"
echo -e "${CYAN}  npm run test${NC}                     Run all tests"
echo -e "${CYAN}  npm run test:backend${NC}             Test backend only"
echo -e "${CYAN}  npm run test:frontend${NC}            Test frontend only"
echo -e "${CYAN}  npm run build${NC}                    Build for production"
echo ""

echo -e "${BOLD}📱 Service URLs (when running):${NC}"
echo -e "  🌐 Frontend:    ${GREEN}http://localhost:3000${NC}"
echo -e "  🔧 Backend API: ${GREEN}http://localhost:4000${NC}"
echo -e "  💚 Health:     ${GREEN}http://localhost:4000/api/health${NC}"
echo ""

echo -e "${BOLD}📖 Documentation:${NC}"
echo -e "  📋 Development Guide: ${CYAN}DEVELOPMENT.md${NC}"
echo -e "  📚 Main README:       ${CYAN}README.md${NC}"
echo ""

echo -e "${BOLD}🎯 Quick Actions:${NC}"
echo -e "${GREEN}[1]${NC} Start development environment"
echo -e "${BLUE}[2]${NC} Check service status" 
echo -e "${YELLOW}[3]${NC} Show this help"
echo -e "${CYAN}[q]${NC} Quit"
echo ""

# Interactive menu (optional)
if [ "${1:-}" != "--no-interactive" ]; then
    read -p "Choose an action [1-3, q]: " choice
    case $choice in
        1)
            echo -e "${GREEN}Starting development environment...${NC}"
            ./dev-start.sh
            ;;
        2)
            echo -e "${BLUE}Checking service status...${NC}"
            ./status.sh
            ;;
        3)
            echo -e "${YELLOW}This help menu${NC}"
            ;;
        q|Q)
            echo "Goodbye! 👋"
            exit 0
            ;;
        *)
            echo -e "${YELLOW}Invalid choice. Use --no-interactive to skip menu.${NC}"
            ;;
    esac
fi
