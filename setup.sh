#!/bin/bash
echo ""
echo "===================================================="
echo "   EduLive - Auto Setup (Mac/Linux)"
echo "===================================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not installed!"
    echo "Download from: https://nodejs.org"
    exit 1
fi

echo "Node.js found: $(node --version)"

# Run setup
node setup.js
