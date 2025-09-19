# 🗺️ GIS-NET Development Scripts

This directory contains several scripts to help you run the GIS-NET application in development mode.

## 🚀 Quick Start

### Option 1: Separate Terminal Windows (Recommended)
```bash
# Start both frontend and backend in separate terminal windows
./dev-start.sh

# Or use npm scripts
npm run dev
```

### Option 2: Single Terminal with Concurrent Output
```bash
# Start both services in the same terminal with colored output
./dev-concurrent.sh
```

### Option 3: Individual Services
```bash
# Start only backend
./dev-start.sh --backend-only
npm run dev:backend

# Start only frontend  
./dev-start.sh --frontend-only
npm run dev:frontend
```

## 📋 Available Scripts

### Shell Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `dev-start.sh` | Main development script (separate terminals) | `./dev-start.sh [options]` |
| `dev-concurrent.sh` | Alternative concurrent approach | `./dev-concurrent.sh` |
| `dev-start.bat` | Windows batch script | `dev-start.bat` |

### NPM Scripts (Root Level)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both services (separate terminals) |
| `npm run dev:frontend` | Start only frontend |
| `npm run dev:backend` | Start only backend |
| `npm run dev:db` | Setup database and start services |
| `npm run check` | Check system requirements |
| `npm run setup` | Install all dependencies and check system |
| `npm run install:all` | Install dependencies for all projects |
| `npm run build` | Build frontend for production |
| `npm run test` | Run all tests |
| `npm run clean` | Remove all node_modules and build files |

## 🛠️ Script Options

### `dev-start.sh` Options

```bash
# Basic usage
./dev-start.sh                 # Start both services
./dev-start.sh --help          # Show help
./dev-start.sh --check         # Check system requirements

# Service-specific
./dev-start.sh --backend-only  # Start only backend
./dev-start.sh --frontend-only # Start only frontend
./dev-start.sh --db           # Setup database and start services
```

## 🔧 System Requirements

Run the requirements check:
```bash
./dev-start.sh --check
```

**Required:**
- Node.js 18+
- npm 9+
- PostgreSQL (for full functionality)

**Supported Terminals:**
- gnome-terminal (recommended)
- xterm
- konsole  
- terminator

## 🌐 Service URLs

Once started, the services will be available at:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **API Documentation**: http://localhost:4000/api
- **Health Check**: http://localhost:4000/api/health

## 🐛 Troubleshooting

### Backend Won't Start
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check database connection
psql -U postgres -d beehive -c "SELECT version();"

# Check backend logs
cd backend && npm run dev
```

### Frontend Issues
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
npm start
```

### Port Conflicts
```bash
# Check what's using the ports
lsof -i :3000  # Frontend
lsof -i :4000  # Backend

# Kill processes if needed
pkill -f "npm start"
pkill -f "npm run dev"
```

### Database Issues
```bash
# Reset database (development only)
cd backend
npm run db:reset

# Or manually
psql -U postgres -c "DROP DATABASE IF EXISTS beehive;"
psql -U postgres -c "CREATE DATABASE beehive;"
```

## 🔄 Development Workflow

1. **First Time Setup:**
   ```bash
   npm run setup
   ```

2. **Daily Development:**
   ```bash
   ./dev-start.sh
   ```

3. **Testing:**
   ```bash
   npm run test
   ```

4. **Building for Production:**
   ```bash
   npm run build
   ```

## 📱 Platform Support

### Linux/macOS
Use the shell scripts (`.sh` files) - they auto-detect your terminal emulator.

### Windows
Use the batch script:
```cmd
dev-start.bat
```

### Cross-Platform Alternative
The concurrent approach works on all platforms:
```bash
npm install
./dev-concurrent.sh    # Unix
# OR
node -e "require('child_process').spawn('npm', ['run', 'dev:concurrent'], {stdio: 'inherit'})"
```

## 🏗️ Project Structure

```
gis-net/
├── dev-start.sh           # Main development script
├── dev-concurrent.sh      # Concurrent approach
├── dev-start.bat         # Windows script
├── package.json          # Root npm scripts
├── backend/              # API server
│   ├── src/
│   └── package.json
└── frontend/             # React app
    ├── src/
    └── package.json
```

## 🤝 Contributing

When adding new scripts:

1. Make them executable: `chmod +x script.sh`
2. Add proper error handling and logging
3. Update this README
4. Test on multiple platforms if possible

## 📞 Support

If you encounter issues:

1. Run `./dev-start.sh --check` to verify requirements
2. Check the troubleshooting section above
3. Check terminal outputs for error messages
4. Ensure all dependencies are installed: `npm run install:all`

---

**Happy Coding! 🚀**
