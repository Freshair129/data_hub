#!/bin/bash
cd "$(dirname "$0")"

echo "------------------------------------------------"
echo "🚀 Next.js CRM Dashboard - Multi-Module Version"
echo "------------------------------------------------"
echo "System: Configuring local Node.js environment..."

# Set local node path
export PATH="$PWD/node_env/bin:$PATH"

# Check if node_modules exists, if not run install
if [ ! -d "crm-app/node_modules" ]; then
    echo "📦 First time setup: Installing dependencies (this may take 1-2 mins)..."
    cd crm-app && npm install
    cd ..
fi

echo "✨ Starting Development Server..."
cd crm-app

# Run Next.js and open browser automatically
# Note: Next.js usually runs on 3000, but if busy it might change.
# We use 'open' after a small delay.
(sleep 5 && open "http://localhost:3000") &

npm run dev
g=8