#!/bin/bash

echo "Starting Навигатор server..."
echo ""
echo "If nodemon is not installed, run: npm install --save-dev nodemon"
echo ""

if [ -d "node_modules/nodemon" ]; then
    npm run dev
else
    echo "nodemon not found. Installing..."
    npm install --save-dev nodemon
    npm run dev
fi
