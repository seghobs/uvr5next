const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Determine Python executable
function getPythonExe() {
  const envPython = path.join(__dirname, 'env', 'python.exe');
  const envScriptsPython = path.join(__dirname, 'env', 'Scripts', 'python.exe');
  
  if (fs.existsSync(envPython)) return envPython;
  if (fs.existsSync(envScriptsPython)) return envScriptsPython;
  return 'python';
}

// Check if server is already running on port 8000
function isPortRunning(port, callback) {
  const req = http.get(`http://localhost:${port}/models`, (res) => {
    callback(true);
  });
  req.on('error', () => {
    callback(false);
  });
  req.setTimeout(800, () => {
    req.destroy();
    callback(false);
  });
}

const pythonExe = getPythonExe();
console.log(`[Backend Runner] Python executable: ${pythonExe}`);

isPortRunning(8000, (running) => {
  if (running) {
    console.log('[Backend Runner] FastAPI backend is already active on http://localhost:8000.');
    return;
  }

  console.log('[Backend Runner] Starting FastAPI backend on http://localhost:8000...');
  const backend = spawn(pythonExe, ['api_modern.py'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
  });

  backend.on('error', (err) => {
    console.error('[Backend Runner] Failed to start Python backend:', err);
  });

  backend.on('close', (code) => {
    console.log(`[Backend Runner] Python backend exited with code ${code}`);
  });

  const cleanup = () => {
    try {
      backend.kill('SIGINT');
    } catch (e) {}
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
});
