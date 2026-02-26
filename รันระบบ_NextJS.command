#!/bin/bash
cd "$(dirname "$0")"

echo "------------------------------------------------"
echo "🚀 Next.js CRM Dashboard - Multi-Module Version"
echo "------------------------------------------------"
echo "System: Configuring environment..."

# 1. Check if crm-app exists
if [ ! -d "crm-app" ]; then
    echo "❌ Error: 'crm-app' directory not found."
    echo "Please ensure you are running this from the root of the data_hub project."
    exit 1
fi

# 2. Set local node path (if exists)
if [ -d "node_env" ]; then
    echo "📦 Using local Node.js environment..."
    export PATH="$PWD/node_env/bin:$PATH"
else
    echo "⚡ Using system Node.js..."
fi

# 3. Check if node_modules exists, if not run install
if [ ! -d "crm-app/node_modules" ]; then
    echo "📦 First time setup: Installing dependencies (this may take 1-2 mins)..."
    cd crm-app && npm install || { echo "❌ Failed to install dependencies"; exit 1; }
    cd ..
fi

echo "✨ Starting Development Server..."
cd crm-app

# 4. Ensure Infrastructure (Redis/Postgres) is running
if command -v docker &> /dev/null && [ -f "docker-compose.yml" ]; then
    echo "🐳 Starting Infrastructure (Redis & Postgres)..."
    docker compose up -d
else
    echo "⚠️ Warning: Docker or docker-compose.yml not found. Redis-dependent features may fail."
fi

# 5. Run Next.js and open browser automatically
# Note: Next.js usually runs on 3000.
(sleep 5 && open "http://localhost:3000") &

echo "------------------------------------------------"
echo "💡 The dashboard will open in your browser shortly."
echo "💡 Press Ctrl+C to stop the server."
echo "------------------------------------------------"

npm run dev