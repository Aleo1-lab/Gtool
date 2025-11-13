// controller.js (v6.0 - TAM SÜRÜM)
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const logger = require('./utils/logger');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const writeFileAtomic = require('write-file-atomic'); 
const { v4: uuidv4 } = require('uuid'); // EKLENDİ

// --- Sabitler ---
const BOTS_CONFIG_PATH = path.join(__dirname, 'config', 'bots.json');
const TASKS_CONFIG_PATH = path.join(__dirname, 'config', 'tasks.json');
const TASKS_LOG_DIR = path.join(__dirname, 'logs', 'tasks');
const BEHAVIORS_DIR = path.join(__dirname, 'behaviors');
const TASKS_DIR = path.join(__dirname, 'behaviors', 'tasks'); // YENİ

const CONTROLLER_PREFIX = 'CONTROLLER';
const API_PORT = 4000;
let io; 

const botStore = new Map();

// YENİ: Script listelerini hafızada tut
const availableScripts = {
    behaviors: [],
    tasks: []
};

// --- DEBOUNCED KAYIT (CONFIG) ---
let saveTimerConfig = null;
function debouncedSaveConfig() {
    clearTimeout(saveTimerConfig);
    saveTimerConfig = setTimeout(saveConfigToFile, 500); 
}
async function saveConfigToFile() {
    controllerLog('log', 'Config (bots.json) kaydediliyor (debounced)...');
    try {
        const botList = Array.from(botStore.values()).map(botState => botState.config);
        const data = JSON.stringify(botList, null, 2); 
        await writeFileAtomic(BOTS_CONFIG_PATH, data);
        controllerLog('log', 'Config (bots.json) başarıyla kaydedildi.');
    } catch (err) {
        controllerLog('error', `Config (bots.json) kaydedilemedi: ${err.message}`);
    }
}

// --- DEBOUNCED KAYIT (TASKS) ---
let saveTimerTasks = null;
function debouncedSaveTasks() {
    clearTimeout(saveTimerTasks);
    saveTimerTasks = setTimeout(saveTasksToFile, 1000);
}
async function saveTasksToFile() {
    controllerLog('log', 'Config (tasks.json) kaydediliyor (debounced)...');
    try {
        const tasksData = {};
        for (const [botName, botState] of botStore.entries()) {
            if (botState.taskQueue && botState.taskQueue.length > 0) {
                tasksData[botName] = botState.taskQueue;
            }
        }
        const data = JSON.stringify(tasksData, null, 2);
        await writeFileAtomic(TASKS_CONFIG_PATH, data);
        controllerLog('log', 'Config (tasks.json) başarıyla kaydedildi.');
    } catch (err) {
        controllerLog('error', `Config (tasks.json) kaydedilemedi: ${err.message}`);
    }
}
// --- TASK LOG YAZICI ---
async function writeTaskLog(botName, taskId, message) {
    try {
        const botLogDir = path.join(TASKS_LOG_DIR, botName);
        if (!fs.existsSync(botLogDir)) {
            fs.mkdirSync(botLogDir, { recursive: true });
        }
        const logFilePath = path.join(botLogDir, `${taskId}.log`);
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        
        await fs.promises.appendFile(logFilePath, logLine);

    } catch (err) {
        controllerLog('error', `Task log [${taskId}] dosyasına yazılamadı: ${err.message}`);
    }
}


function controllerLog(type = 'log', message) {
    logger[type](CONTROLLER_PREFIX, message);
    if (io) {
        io.emit('log', {
            prefix: CONTROLLER_PREFIX,
            message: message,
            type: type
        });
    }
}

function handleBotMessage(botName, message) {
    const { type, payload } = message; 
    const botState = botStore.get(botName);
    if (!botState) return;

    // --- STATS GÜNCELLEME (DEĞİŞİKLİK YOK) ---
    if (type === 'stats') {
        const oldStats = botState.stats;
        const newStats = { ...oldStats, ...payload };
        const deltaStats = {};
        
        if (oldStats.health !== newStats.health) deltaStats.health = newStats.health;
        if (oldStats.food !== newStats.food) deltaStats.food = newStats.food;
        if (oldStats.state !== newStats.state) deltaStats.state = newStats.state;
        if (JSON.stringify(oldStats.pos) !== JSON.stringify(newStats.pos)) {
            deltaStats.pos = newStats.pos;
        }
        if (JSON.stringify(oldStats.nearbyEntities) !== JSON.stringify(newStats.nearbyEntities)) {
            deltaStats.nearbyEntities = newStats.nearbyEntities;
        }
        if (JSON.stringify(oldStats.inventory) !== JSON.stringify(newStats.inventory)) {
            deltaStats.inventory = newStats.inventory;
        }
        
        botState.stats = newStats;
        
        if (Object.keys(deltaStats).length > 0) {
            io.emit('bot_delta', { 
                name: botName, 
                changed: { stats: deltaStats } 
            });
        }
        return;
    }
    
    // --- TASK SİSTEMİ IPC ---
    switch (type) {
        case 'getNextTask':
            if (botState.process) {
                const task = botState.taskQueue.shift(); 
                if (task) {
                    controllerLog('log', `Görev [${task.id}] -> [${botName}] botuna gönderiliyor.`);
                    botState.process.send({ type: 'nextTask', task: task });
                    debouncedSaveTasks();
                    // YENİ: Görev başladığı için kuyruğu panele de yolla
                    io.emit('bot_delta', {
                        name: botName,
                        changed: { taskQueue: botState.taskQueue }
                    });
                } else {
                    botState.process.send({ type: 'nextTask', task: null });
                }
            }
            return; 
            
        case 'task_log':
            const { taskId, message: logMessage } = payload;
            const roomName = `task_log:${taskId}`;
            io.to(roomName).emit('log_stream', { taskId, message: logMessage });
            writeTaskLog(botName, taskId, logMessage);
            return; 
            
        case 'taskComplete':
        case 'taskFailed':
            controllerLog('log', `Görev [${payload.taskId}] -> [${botName}] tarafından '${type}' olarak tamamlandı.`);
            // YENİ: Görev bittiği için kuyruğun son halini panele yolla
            // (Zaten getNextTask'te shift() edildiği için kuyruk günceldir)
            io.emit('bot_delta', {
                name: botName,
                changed: { taskQueue: botState.taskQueue }
            });
            return;
    }

    // --- GENEL BOT LOGLAMA (DEĞİŞİKLİK YOK) ---
    let loggerFunction;
    switch (type) {
        case 'status': loggerFunction = logger.log; break;
        case 'error': loggerFunction = logger.error; break;
        case 'warn': loggerFunction = logger.warn; break;
        case 'log': default: loggerFunction = logger.log;
    }
    loggerFunction(botName, payload);
    if (io) {
        io.emit('log', {
            prefix: botName,
            message: payload,
            type: type 
        });
    }
}

// (startBot fonksiyonu bir önceki adımdaki ile %100 aynı, değişiklik yok)
function startBot(botConfig) {
    const botName = botConfig.name;
    const botState = botStore.get(botName);
    if (botState.process) {
        controllerLog('warn', `Bot ${botName} is already running.`);
        return false;
    }
    controllerLog('log', `Starting bot: ${botName}...`);
    const botProcess = fork(path.join(__dirname, 'bot.js'));
    botProcess.on('exit', (code) => {
        const botStateOnExit = botStore.get(botName); 
        if (!botStateOnExit) return; 
        const botExitedMessage = `Process exited with code ${code}.`;
        const oldStatus = botStateOnExit.status;
        botStateOnExit.process = null;
        botStateOnExit.status = 'stopped';
        const currentConfig = botStateOnExit.config;
        if (oldStatus === 'running') {
            botStateOnExit.stats = { inventory: [] }; 
            io.emit('bot_delta', { 
                name: botName, 
                changed: { 
                    status: 'stopped', 
                    stats: { inventory: [] },
                    taskQueue: botStateOnExit.taskQueue 
                } 
            });
        }
        if (code !== 0 && currentConfig && currentConfig.autoReconnect === true) {
            logger.warn(botName, botExitedMessage + " (Unexpected stop/crash)");
            const delayInSeconds = currentConfig.reconnectDelay || 30;
            controllerLog('log', `Bot ${botName} will try to reconnect in ${delayInSeconds} seconds...`);
            setTimeout(() => {
                if (botStore.has(botName)) {
                     controllerLog('log', `Attempting to restart bot: ${botName}...`);
                    startBot(currentConfig); 
                }
            }, delayInSeconds * 1000);
        } else if (botStateOnExit.markedForDeletion) {
            logger.log(botName, `Process stopped and marked for deletion. Removing from store.`);
            botStore.delete(botName);
            io.emit('bot_removed', { name: botName });
            debouncedSaveConfig();
            debouncedSaveTasks();
        } else {
            if (code === 0) logger.log(botName, botExitedMessage + " (Planned stop)");
            else logger.warn(botName, botExitedMessage + " (Crashed, autoReconnect is off)");
        }
    });
    botProcess.on('message', (message) => {
        handleBotMessage(botName, message);
    });
    botProcess.send({ type: 'init', config: botConfig });
    botState.process = botProcess;
    botState.status = 'running';
    io.emit('bot_delta', { name: botName, changed: { status: 'running' } });
    return true;
}

// (sendCommandToBot fonksiyonu bir önceki adımdaki ile %100 aynı, değişiklik yok)
function sendCommandToBot(botName, command, args = []) {
    const botState = botStore.get(botName);
    if (botState && botState.process) {
        controllerLog('log', `Sending command '${command}' to ${botName}`);
        botState.process.send({ type: 'command', command, args });
        return true;
    } else {
        controllerLog('warn', `Bot ${botName} is not running or not in store (may be pending deletion).`);
        return false;
    }
}


function startAPIServer() {
    const app = express();
    const server = http.createServer(app);
    io = new Server(server); 

    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
    app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
    app.use(express.json());

    // (API Endpointleri /bots/status, /start, /command %100 aynı, değişiklik yok)
    app.get('/bots/status', (req, res) => {
        const statusList = Array.from(botStore.values()).map(botState => ({
            name: botState.config.name, status: botState.status, behavior: botState.config.behavior
        }));
        res.json(statusList);
    });
    app.post('/bots/start/:botName', (req, res) => {
        const { botName } = req.params; const botState = botStore.get(botName);
        if (!botState) return res.status(404).json({ error: `Bot '${botName}' not found in config.` });
        if (botState.process) return res.status(400).json({ error: `Bot '${botName}' is already running.` });
        if (startBot(botState.config)) res.json({ success: true, message: `Bot '${botName}' started.` });
        else res.status(500).json({ error: `Failed to start bot '${botName}'.` });
    });
    app.post('/bots/command/:botName', (req, res) => {
        const { botName } = req.params; const { command, args } = req.body; 
        if (!command) return res.status(400).json({ error: 'Missing "command" in request body.' });
        const botState = botStore.get(botName);
        if (!botState || !botState.process) return res.status(404).json({ error: `Bot '${botName}' is not running.` });
        if (sendCommandToBot(botName, command, args || [])) res.json({ success: true, message: `Command '${command}' sent to ${botName}.` });
        else res.status(500).json({ error: `Failed to send command to bot '${botName}'.` });
    });


    // Socket.io Dinleyicileri (Task Sistemi eklendi)
    io.on('connection', (socket) => {
        controllerLog('log', 'Web Arayüzü bağlandı.');
        
        // 1. Full State Gönder
        const fullState = Array.from(botStore.entries()).map(([name, botState]) => ({
            name: name,
            config: botState.config,
            status: botState.status,
            stats: botState.stats,
            taskQueue: botState.taskQueue 
        }));
        socket.emit('full_state', fullState); 
        
        // 2. YENİ: Script Listesini Gönder
        socket.emit('available_scripts', availableScripts);

        // (command_start, command_stop, command_send_global %100 aynı, değişiklik yok)
        socket.on('command_start', (botName) => {
            controllerLog('log', `Web'den 'start' komutu: ${botName}`);
            const botState = botStore.get(botName);
            if (botState) startBot(botState.config);
            else controllerLog('error', `Geçersiz bot adı: ${botName}`);
        });
        socket.on('command_stop', (botName) => {
            controllerLog('log', `Web'den 'stop' komutu: ${botName}`);
            sendCommandToBot(botName, 'stop');
        });
        socket.on('command_send_global', (data) => {
            const { target, fullCommand } = data; if (!target || !fullCommand) return;
            const parts = fullCommand.trim().split(' '); const command = parts.shift(); const args = parts;
            if (target === '*') {
                controllerLog('log', `GLOBAL KOMUT -> [TÜM BOTLAR]: ${command} [${args.join(', ')}]`);
                for (const [botName, botState] of botStore.entries()) {
                    if (botState.process) sendCommandToBot(botName, command, args);
                }
            } else {
                controllerLog('log', `GLOBAL KOMUT -> [${target}]: ${command} [${args.join(', ')}]`);
                if (botStore.get(target)?.process) sendCommandToBot(target, command, args);
                else controllerLog('error', `Komut gönderilemedi: Bot ${target} çalışmıyor.`);
            }
        });
        
        // (config_add_bot, config_delete_bot, config_get_bot %100 aynı, değişiklik yok)
        socket.on('config_add_bot', async (botData) => {
            if (!botData || !botData.name) { controllerLog('error', 'Geçersiz bot config verisi alındı.'); return; }
            const botName = botData.name;
            controllerLog('log', `Web'den 'Bot Ekle/Güncelle' komutu: ${botName}`);
            const isNewBot = !botStore.has(botName);
            const existingState = botStore.get(botName) || {
                process: null, stats: { inventory: [] }, status: 'stopped', taskQueue: []
            };
            botStore.set(botName, { ...existingState, config: botData });
            debouncedSaveConfig();
            if (isNewBot) {
                io.emit('bot_added', {
                    name: botName, config: botData, status: 'stopped',
                    stats: { inventory: [] }, taskQueue: []
                });
            } else {
                io.emit('bot_delta', { name: botName, changed: { config: botData } });
            }
        });
        socket.on('config_delete_bot', async (botName) => {
            controllerLog('log', `Web'den 'Bot Sil' komutu: ${botName}`);
            if (botStore.has(botName)) {
                const botState = botStore.get(botName);
                if (botState.process) {
                    botState.markedForDeletion = true;
                    sendCommandToBot(botName, 'stop'); 
                    controllerLog('warn', `Çalışan bot ${botName} silinmek için işaretlendi, durduruluyor...`);
                } else {
                    controllerLog('log', `Duran bot ${botName} store'dan siliniyor.`);
                    botStore.delete(botName);
                    io.emit('bot_removed', { name: botName });
                    debouncedSaveConfig();
                    debouncedSaveTasks();
                }
            } else {
                 controllerLog('error', `Silinmek istenen bot config'de bulunamadı: ${botName}`);
            }
        });
        socket.on('config_get_bot', (botName) => {
            const botState = botStore.get(botName);
            if (botState) socket.emit('config_show_bot', botState.config);
        });

        // --- TASK SİSTEMİ SOCKET.IO ---
        socket.on('task_add', (data) => {
            const { botName, scriptName, params } = data;
            const botState = botStore.get(botName);
            if (!botState) {
                controllerLog('error', `Görev eklenemedi: Bot ${botName} bulunamadı.`); return;
            }
            // Script'in task listesinde olup olmadığını kontrol et
            if (!availableScripts.tasks.includes(scriptName)) {
                 controllerLog('error', `Görev eklenemedi: ${scriptName} geçerli bir task script'i değil.`); return;
            }
            const newTask = {
                id: uuidv4(), scriptName: scriptName, params: params || {}, status: 'pending'
            };
            botState.taskQueue.push(newTask);
            debouncedSaveTasks(); 
            io.emit('bot_delta', {
                name: botName,
                changed: { taskQueue: botState.taskQueue }
            });
            controllerLog('log', `Yeni görev [${newTask.id}] -> [${botName}] kuyruğuna eklendi.`);
        });
        socket.on('task_view_logs', (data) => {
            const { taskId, join } = data;
            const roomName = `task_log:${taskId}`;
            if (join) {
                socket.join(roomName);
                controllerLog('log', `Web Arayüzü [${taskId}] log odasına katıldı.`);
                // TODO: Katıldığı anda eski logları da yollayabiliriz (fs.readFile)
            } else {
                socket.leave(roomName);
                controllerLog('log', `Web Arayüzü [${taskId}] log odasından ayrıldı.`);
            }
        });
        // --- TASK SİSTEMİ BİTİŞİ ---

        socket.on('disconnect', () => {
            controllerLog('log', 'Web Arayüzü bağlantısı kesildi.');
        });
    });

    server.listen(API_PORT, () => {
        logger.log(CONTROLLER_PREFIX, `Web Panel & API http://localhost:${API_PORT} adresinde çalışıyor`);
    });
}

// YENİ: Script Tarama Fonksiyonu
function scanScripts() {
    // 1. Ana Behavior'ları Tara
    try {
        if (!fs.existsSync(BEHAVIORS_DIR)) fs.mkdirSync(BEHAVIORS_DIR);
        availableScripts.behaviors = fs.readdirSync(BEHAVIORS_DIR)
            .filter(file => file.endsWith('.js') && file !== 'task_runner.js'); // task_runner'ı gizle
    } catch (e) {
        logger.error(CONTROLLER_PREFIX, `Ana 'behaviors' klasörü okunamadı: ${e.message}`);
    }
    
    // 2. Task Script'lerini Tara
    try {
        if (!fs.existsSync(TASKS_DIR)) fs.mkdirSync(TASKS_DIR);
        availableScripts.tasks = fs.readdirSync(TASKS_DIR)
            .filter(file => file.endsWith('.js'));
    } catch (e) {
        logger.error(CONTROLLER_PREFIX, `'behaviors/tasks' klasörü okunamadı: ${e.message}`);
    }
    
    logger.log(CONTROLLER_PREFIX, `Script taraması tamamlandı. (Behaviors: ${availableScripts.behaviors.length}, Tasks: ${availableScripts.tasks.length})`);
}


// Ana Fonksiyon (v6.0)
function main() {
    logger.log(CONTROLLER_PREFIX, 'MineBot Controller v6.0 starting...');
    
    // 0. Gerekli klasörleri oluştur
    if (!fs.existsSync(TASKS_LOG_DIR)) fs.mkdirSync(TASKS_LOG_DIR, { recursive: true });
    
    // 1. YENİ: Script'leri Tara
    scanScripts();

    // 2. Bot Config'lerini Yükle
    let bots = [];
    try {
        if (!fs.existsSync(BOTS_CONFIG_PATH)) fs.writeFileSync(BOTS_CONFIG_PATH, '[]', 'utf8');
        const configFile = fs.readFileSync(BOTS_CONFIG_PATH, 'utf8');
        bots = JSON.parse(configFile);
    } catch (err) {
        logger.error(CONTROLLER_PREFIX, `Config (bots.json) okunamadı: ${err.message}`); return;
    }

    // 3. Task Config'lerini Yükle
    let tasks = {};
    try {
        if (!fs.existsSync(TASKS_CONFIG_PATH)) fs.writeFileSync(TASKS_CONFIG_PATH, '{}', 'utf8');
        const tasksFile = fs.readFileSync(TASKS_CONFIG_PATH, 'utf8');
        tasks = JSON.parse(tasksFile);
    } catch (err) {
        logger.error(CONTROLLER_PREFIX, `Config (tasks.json) okunamadı: ${err.message}`);
    }
    
    // 4. İki config'i botStore'da birleştir
    for (const botConfig of bots) {
        botStore.set(botConfig.name, {
            config: botConfig,
            process: null,
            stats: { inventory: [] }, 
            status: 'stopped',
            taskQueue: tasks[botConfig.name] || [] 
        });
    }
    logger.log(CONTROLLER_PREFIX, `Loaded ${botStore.size} bot configurations and task queues.`);

    // 5. API ve Web Sunucusunu Başlat
    startAPIServer();
}

main();