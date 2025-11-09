# UX & Developer Changelog

This document summarizes the major improvements made to the MineBot Swarm Manager.

## v2.0.0 - Refactoring for Stability and Observability

### 🌟 Key Improvements

*   **Automatic Bot Process Restart:** The controller now acts as a true supervisor. If a bot process crashes, it will be automatically restarted with an exponential backoff delay. This prevents silent failures and dramatically improves swarm uptime.
*   **Unified IPC Communication:** Replaced the complex hybrid WebSocket/IPC system with a single, efficient IPC channel for all controller-bot communication. This simplifies the architecture and reduces overhead.
*   **Rich Status Reporting:** Bots now report a detailed status object to the controller, including:
    *   `status`: `online`, `offline`, `reconnecting`, `stopped`
    *   `behavior`: The currently running behavior module.
    *   `lastAction`: The last reported progress from the behavior.
    *   `memory`: Live RAM usage.
    *   `ping`: Latency to the Minecraft server.
    *   `restarts`: Number of times the process has been restarted.
*   **Behavior-Level Progress Updates:** Behavior modules can now report their progress (e.g., "Pathfinding to [x, z]"), which is visible in the CLI, providing clear insight into what a bot is doing.

###  CLI Enhancements

*   **Color-Coded Status Table:** The `list` command now displays all bots in a clean, color-coded table, making it easy to assess the health of the entire swarm at a glance.
    *   **Green:** Online
    *   **Yellow:** Reconnecting
    *   **Red:** Offline / Stopped
*   **Fleet Commands:** Added `execAll` and `setBehaviorAll` commands to issue commands to all bots simultaneously.
*   **JSON Output:** The `list` command now supports a `--json` flag for easy integration with external monitoring tools and scripts.
*   **Centralized Logging:** Bot logs are now streamed to the controller, providing a single point for observing the entire swarm's activity without log spam.

### ⚙️ Developer & Configuration Changes

*   **Simplified Bot Core (`bot.js`):** Removed all WebSocket client logic, simplifying the bot's responsibility to just executing tasks and reporting back to the parent process.
*   **New Configuration Options (`config.json`):**
    *   Added `controller.restart` options to configure the auto-restart behavior (retries and delay).
*   **Standardized Behavior Interface:** Behavior modules now receive a `reportProgress` function, establishing a clear pattern for progress reporting.
