@echo off
rem Starts Olympia and opens it in your browser.
cd /d "%~dp0"
if not exist node_modules\three call npm install
start "" http://localhost:3110
node server.js
