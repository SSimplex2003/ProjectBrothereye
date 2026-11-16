#!/usr/bin/env node

/**
 * Development script that runs both frontend and backend concurrently
 * Uses Node.js built-in child_process - no external dependencies needed
 */

const { spawn } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';

// ANSI color codes
const colors = {
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
  dim: '\x1b[2m'
};

console.log(`${colors.dim}Starting development servers...${colors.reset}\n`);

// Frontend process (Next.js)
const frontend = spawn(
  isWindows ? 'npx.cmd' : 'npx',
  ['next', 'dev'],
  {
    cwd: process.cwd(),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows
  }
);

// Backend process (Express)
const backend = spawn(
  'node',
  ['--watch', 'server.js'],
  {
    cwd: path.join(process.cwd(), 'backend'),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows
  }
);

// Prefix output with labels
function prefixOutput(proc, name, color) {
  const prefix = `${color}[${name}]${colors.reset} `;
  
  proc.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        process.stdout.write(prefix + line + '\n');
      }
    });
  });
  
  proc.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        process.stderr.write(prefix + line + '\n');
      }
    });
  });
}

prefixOutput(frontend, 'FE', colors.cyan);
prefixOutput(backend, 'BE', colors.yellow);

// Handle process exit
function cleanup() {
  console.log(`\n${colors.dim}Shutting down...${colors.reset}`);
  frontend.kill();
  backend.kill();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

frontend.on('close', (code) => {
  console.log(`${colors.cyan}[FE]${colors.reset} Frontend exited with code ${code}`);
  backend.kill();
  process.exit(code);
});

backend.on('close', (code) => {
  console.log(`${colors.yellow}[BE]${colors.reset} Backend exited with code ${code}`);
  frontend.kill();
  process.exit(code);
});

console.log(`${colors.cyan}[FE]${colors.reset} Frontend starting on http://localhost:3000`);
console.log(`${colors.yellow}[BE]${colors.reset} Backend starting on http://localhost:3001\n`);
