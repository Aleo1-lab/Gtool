🧠 MineBot Swarm Manager — Technical Documentation

Version: 1.0.0
Core Library: mineflayer@4.33.0
Author: Internal Development Team
Environment: Node.js LTS (v18–24), Linux-based system
Target: Multi-bot orchestration (~30 concurrent Minecraft Java bots)
Primary Goals:

Lightweight memory usage

Reliable multi-process control

Modular bot behaviors

Real-time centralized management

1. ⚙️ System Overview

MineBot Swarm Manager is a distributed, modular system built on top of the Mineflayer framework.
It allows running and managing up to 30 concurrent Minecraft bots with minimal RAM usage (~120–150 MB per bot).

Key Principles

Isolation: Each bot runs in a separate process (avoids crash propagation).

Scalability: Easily extendable to 50+ bots by adjusting controller parameters.

Low Resource Use: No viewer, minimal logging, limited event listeners.

Control: Centralized WebSocket controller for issuing commands and tracking metrics.

2. 🧩 Architecture Overview
+---------------------------------------------------------------+
|                     MINEBOT CONTROLLER                        |
|---------------------------------------------------------------|
|  - ProcessManager      |  - WebSocket Server (ws)             |
|  - Config Loader        |  - Status Monitor (pidusage)         |
|  - Logger (winston)     |  - Error/Crash Recovery              |
+---------------------------------------------------------------+
            |                 |                 |
         [Bot 1]           [Bot 2]           [Bot 30]
            |                 |                 |
+---------------------------------------------------------------+
|                      BOT CORE MODULE                          |
|---------------------------------------------------------------|
| - mineflayer@4.33.0                                          |
| - Behavior Loader (idle.js, guard.js, follow.js...)           |
| - Reconnect Manager                                           |
| - Command Listener (WebSocket Client)                         |
| - Minimal Event System                                        |
+---------------------------------------------------------------+

3. 🧱 Core Components & Classes
3.1. Controller Layer
Class / File	Purpose	Description
Controller.js	Main process orchestrator	Spawns, monitors, and manages multiple bot processes.
ProcessManager	Subprocess handler	Uses child_process.fork() to start and isolate bots.
BotRegistry	Bot metadata handler	Maintains bot states, names, uptime, crash count.
WebSocketServer	Communication hub	Handles external commands & status broadcasts via ws.
ConfigLoader	Parser for bots.json	Loads bot definitions and runtime options.
Logger	Logging interface	Centralized logging with rotation (via winston).
Example: Controller Process Flow
flowchart TD
  A[Start Controller] --> B[Load bots.json]
  B --> C[Spawn child processes]
  C --> D[Monitor via pidusage]
  D --> E{Bot crashed?}
  E -->|Yes| F[Restart bot]
  E -->|No| G[Continue monitoring]

3.2. Bot Core Layer
Class / File	Purpose	Description
BotCore.js	Main Mineflayer instance wrapper	Initializes bot with given credentials/config.
BehaviorManager.js	Dynamic module loader	Imports and executes selected behavior module.
ConnectionHandler.js	Handles spawn, reconnect, kicked events.	
CommandHandler.js	Listens to WS commands (e.g., say, goto, guard).	
ResourceMonitor.js	Reports RAM & CPU back to controller via IPC/WS.	
Main Class Example
class BotCore {
  constructor(config) {
    this.bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version || false,
    });
    this.init();
  }

  init() {
    this.registerBaseEvents();
    this.loadBehavior();
  }

  registerBaseEvents() {
    this.bot.once('spawn', () => console.log(`${this.bot.username} spawned`));
    this.bot.on('kicked', reason => console.log(`Kicked: ${reason}`));
    this.bot.on('error', err => console.error(err));
  }

  loadBehavior() {
    const behavior = require(`./behaviors/${this.config.mode}.js`);
    behavior(this.bot);
  }
}

4. 🔌 Communication Protocol
Transport Layer: WebSocket

Library: ws@8.17.0

Lightweight, persistent duplex communication.

Uses JSON-formatted packets.

Message Structure
{
  "type": "command",
  "target": "Bot12",
  "command": "say",
  "args": ["Hello world"]
}

Message Types
Type	Direction	Example	Description
status	Bot → Controller	{ type: "status", ram: 120, uptime: 350 }	Regular status heartbeat
command	Controller → Bot	{ type: "command", command: "say", args: [] }	Executes bot command
log	Bot → Controller	{ type: "log", msg: "joined the world" }	Logging output
error	Bot → Controller	{ type: "error", msg: "Timeout" }	Exception reporting
5. 🧩 Behavior Modules

Located in /behaviors/
Each module exports a function (bot) => { ... } and implements lightweight AI logic.

Module	Purpose	RAM Cost	Description
idle.js	Base idle behavior	🔹 Very Low	Bot stays still, listens for chat commands.
follow.js	Follow player	🔸 Medium	Tracks player entity and navigates via mineflayer-pathfinder.
guard.js	Patrol/defend area	🔸 Medium	Detects nearby entities, attacks or alerts.
miner.js	Auto-mine blocks	🔸 Medium	Uses block dig logic, requires small pathfinder usage.
trader.js	Trade interactions	🔹 Low	Handles villager/GUI trade events.

Optional dependencies:

mineflayer-pathfinder@2.8.5 (only load if required)

mineflayer-collectblock@1.4.0 (for resource collection)

6. 💾 Configuration Structure

/config/bots.json

[
  {
    "name": "Bot1",
    "host": "mc.server.local",
    "port": 25565,
    "version": "1.20.4",
    "mode": "idle",
    "proxy": "socks5://127.0.0.1:9050"
  },
  {
    "name": "Bot2",
    "host": "mc.server.local",
    "mode": "guard"
  }
]


/config/env.json

{
  "controllerPort": 3000,
  "logLevel": "info",
  "restartDelay": 5000,
  "memoryLimitMB": 150
}

7. 🧮 Performance & Memory Strategy
Layer	Strategy	Details
Node Runtime	--max-old-space-size=150	Per bot process memory limit
Chunk Loading	Disabled movement until command	Avoids automatic chunk load
Event Listeners	Limited to essentials	spawn, chat, error, kicked only
Logging	Throttled log rotation	Only last 100 entries in memory
Monitoring	pidusage per process	Real-time CPU/RAM stats
Restart Policy	Auto-restart crashed bots	Graceful respawn handled by Controller

Average target consumption:

RAM: 120–150 MB per bot

CPU: < 5% per idle bot

8. 📂 Directory Layout
MineBot-Swarm/
├── controller/
│   ├── Controller.js
│   ├── BotRegistry.js
│   ├── WebSocketServer.js
│   └── ConfigLoader.js
├── bot/
│   ├── BotCore.js
│   ├── BehaviorManager.js
│   ├── ConnectionHandler.js
│   ├── CommandHandler.js
│   ├── behaviors/
│   │   ├── idle.js
│   │   ├── guard.js
│   │   ├── follow.js
│   │   ├── miner.js
│   │   └── trader.js
├── config/
│   ├── bots.json
│   ├── env.json
│   └── secrets.env
├── logs/
│   └── bot_logs/
└── utils/
    ├── Logger.js
    └── Metrics.js

9. 🔐 Security Considerations

Use .env for sensitive credentials (Microsoft tokens, proxies).

Encrypt communication between controller and dashboard via wss:// (TLS).

Prevent unauthorized command injection by validating all WS messages.

Disable dangerous Mineflayer plugins unless explicitly required.

10. 🚀 Deployment & Scaling
Recommended Environment
Resource	Value
CPU	6+ cores
RAM	8–12 GB
OS	Ubuntu 22.04+
Node.js	v20 LTS
Process Manager	pm2@5.4.0
Scaling Strategy

Each bot as a separate PM2 process:

pm2 start bot/BotCore.js --name Bot1 --max-memory-restart 150M


Controller runs as global orchestrator (controller/Controller.js).

Optionally, use a message broker (e.g., Redis pub/sub) for distributed coordination if >50 bots.

11. 🧪 Testing Plan
Test	Method	Success Criteria
Connection	Spawn 30 bots	All connect and stay online 60 min
Memory Load	Measure via pidusage	<150 MB per bot
Command Handling	Broadcast say	All respond within 1 s
Recovery	Force crash	Bot auto-respawns within 5 s
Performance	Stress 100 chat msgs/min	No memory leak or crash
12. 🧭 Future Extensions

AI Behavior Engine: Integrate a lightweight decision tree or LLM-driven task selection.

Distributed Controller: Cluster controllers across multiple machines using ZeroMQ.

Web Dashboard (React + Socket.io): Live control and bot telemetry view.

Database Persistence: Store bot stats & performance logs in SQLite or MongoDB.

13. 📚 Dependency Versions
Package	Version	Purpose
mineflayer	4.33.0	Core Minecraft API
ws	8.17.0	WebSocket communication
winston	3.13.0	Logging system
pidusage	3.0.2	Resource monitoring
dotenv	16.4.1	Environment variable management
mineflayer-pathfinder	2.8.5	Optional navigation AI
mineflayer-collectblock	1.4.0	Optional resource gathering
pm2	5.4.0	Process management
express	4.19.2 (optional)	HTTP control interface
14. 🧾 Conclusion

The MineBot Swarm Manager provides a modular and memory-efficient framework for operating large-scale Minecraft automation fleets.
By leveraging isolated Node.js processes, optimized Mineflayer configurations, and centralized WebSocket control, it ensures both high scalability and low resource footprint.

This technical document defines the baseline architecture for implementation, expansion, and long-term maintenance.