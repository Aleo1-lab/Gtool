// public/js/stateManager.js

/**
 * v6.0 - Task System State Management
 * - taskQueue'yu botStore'a ekler
 * - Task modal'ları ve log stream için eylem (action) ve event'leri ekler.
 */
class StateManager {
    constructor() {
        this.events = {}; 
        this.botStore = new Map();
        this.focusedBot = null;
        
        // YENİ: Task Sistemi State
        this.availableBehaviors = []; // Bot form'daki behavior listesi
        this.availableTaskScripts = []; // Task modal'daki script listesi
        this.currentTaskLog = { // Canlı log izleme
            taskId: null,
            logs: []
        };
    }

    // --- Pub/Sub Metotları ---
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Error in state listener for '${event}':`, e);
                }
            });
        }
    }

    // --- State Değiştirme Metotları (Mutators) ---

    setFullState(bots) {
        this.botStore.clear();
        bots.forEach(bot => {
            // Gelen 'bot' objesi config, status, stats VE taskQueue içeriyor
            this.botStore.set(bot.name, bot);
        });
        this.emit('state:fullState', Array.from(this.botStore.values()));
    }

    applyDelta(delta) {
        const bot = this.botStore.get(delta.name);
        if (!bot) return;

        if (delta.changed.status !== undefined) {
            bot.status = delta.changed.status;
        }
        if (delta.changed.config !== undefined) {
            bot.config = delta.changed.config;
        }
        if (delta.changed.stats !== undefined) {
            bot.stats = { ...bot.stats, ...delta.changed.stats };
        }
        // YENİ: Task Kuyruğu Deltası
        if (delta.changed.taskQueue !== undefined) {
            bot.taskQueue = delta.changed.taskQueue;
        }
        
        this.emit('state:botDelta', { bot, changed: delta.changed });
    }

    addBot(bot) {
        if (this.botStore.has(bot.name)) return;
        this.botStore.set(bot.name, bot);
        this.emit('state:botAdded', bot);
    }

    removeBot(botName) {
        if (!this.botStore.has(botName)) return;
        if (this.focusedBot === botName) {
            this.setFocusedBot(null);
        }
        this.botStore.delete(botName);
        this.emit('state:botRemoved', botName);
    }
    
    setFocusedBot(botName) {
        if (botName === null || this.focusedBot === botName) {
            botName = null; 
        }
        if (this.focusedBot === botName) return; 
        
        const oldFocus = this.focusedBot;
        this.focusedBot = botName;
        this.emit('state:focusedBotChanged', { newFocus: botName, oldFocus: oldFocus });
    }

    // YENİ: Script Listelerini (Behaviors ve Tasks) Ayarla
    setAvailableScripts(scripts) {
        this.availableBehaviors = scripts.behaviors;
        this.availableTaskScripts = scripts.tasks;
        this.emit('state:scriptsLoaded');
    }

    // YENİ: Canlı Görev Log Akışı
    handleTaskLogStream(logData) {
        // { taskId, message }
        if (this.currentTaskLog.taskId === logData.taskId) {
            this.currentTaskLog.logs.push(logData.message);
            this.emit('state:taskLogStream', logData.message);
        }
    }
    
    // --- UI -> Socket için Eylemler (ACTIONS) ---
    
    submitBotForm(botData) {
        this.emit('action:submitForm', botData);
    }
    requestBotAction(action, botName) {
        this.emit('action:botCommand', { action, botName });
    }
    sendGlobalCommand(target, fullCommand) {
        this.emit('action:globalCommand', { target, fullCommand });
    }
    requestLogFocus(botName) {
        this.setFocusedBot(botName);
    }
    requestConfigForEdit(botName) {
        this.emit('action:getConfig', botName);
    }
    
    // YENİ: Task Sistemi Eylemleri
    requestTaskModal(botName) {
        const bot = this.botStore.get(botName);
        if (bot) {
            this.emit('state:showTaskModal', bot);
        }
    }
    
    requestAddTask(taskData) {
        // { botName, scriptName, params }
        this.emit('action:addTask', taskData);
    }

    requestTaskLogView(botName, task) {
        this.currentTaskLog = { taskId: task.id, logs: [] };
        this.emit('action:viewTaskLogs', { taskId: task.id, join: true });
        this.emit('state:showTaskLogModal', { botName, task });
    }
    
    requestStopTaskLogView() {
        if (this.currentTaskLog.taskId) {
            this.emit('action:viewTaskLogs', { taskId: this.currentTaskLog.taskId, join: false });
            this.currentTaskLog = { taskId: null, logs: [] };
        }
    }

    // --- State -> UI için Olaylar (EVENTS) ---
    
    showConfigForm(botConfig) {
        this.emit('state:showConfigForm', botConfig);
    }
    
    log(logData) {
        this.emit('state:log', logData);
    }
}

export const state = new StateManager();