#!/usr/bin/env node
/**
 * Start the Asktra backend (FastAPI) for local dev — like gemini3, no manual uvicorn.
 * Runs from repo root: node scripts/dev-backend.js
 */
const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, '..', 'backend');
const python = process.platform === 'win32' ? 'python' : 'python3';
const child = spawn(python, ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8000'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (err) => {
  console.error('Backend failed to start:', err.message);
  console.error('Ensure Python is installed and run from repo root: pip install -r requirements.txt (in backend)');
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
