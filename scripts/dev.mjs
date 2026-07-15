import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteEntry = resolve(root, "node_modules/vite/bin/vite.js");
const localPython = resolve(root, ".venv/bin/python");
const python = process.env.PYTHON || (existsSync(localPython) ? localPython : "python3");
const children = [];
let stopping = false;

function portIsOpen(port, host) {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ port, host });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveOpen(open);
    };
    socket.setTimeout(350);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

const webIsRunning = await portIsOpen(5173, "::1") || await portIsOpen(5173, "127.0.0.1");
const apiIsRunning = await portIsOpen(5050, "127.0.0.1");

if (webIsRunning && apiIsRunning) {
  console.log("SafeMind is already running at http://localhost:5173");
  process.exit(0);
}

if (webIsRunning || apiIsRunning) {
  const occupied = webIsRunning ? "5173 (website)" : "5050 (AI API)";
  console.error(`SafeMind cannot start because port ${occupied} is already in use.`);
  console.error("Stop the older development process with Ctrl+C, then run npm run dev again.");
  process.exit(1);
}

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${label} could not start: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${label} stopped${code !== null ? ` with code ${code}` : signal ? ` from ${signal}` : ""}.`);
      stop(code || 0);
    }
  });
  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (!child.killed) child.kill("SIGTERM");
  });
  setTimeout(() => process.exit(exitCode), 150).unref();
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start(python, ["-u", "-m", "nlp_service.app"], "SafeMind analysis API");
start(process.execPath, [viteEntry], "Vite");
