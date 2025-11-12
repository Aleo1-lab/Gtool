// controller.js
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const logger = require('./utils/logger');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const writeFileAtomic = require('write-file-atomic'); 

const BOTS_CONFIG_PATH = path.join(__dirname, 'config', 'bots.json');
const CONTROLLER_PREFIX = 'CONTROLLER';
const API_PORT = 4000;
let io; 

const botStore = new Map();

let saveTimer = null;
function debouncedSaveConfig() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfigToFile, 500); 
}

async function saveConfigToFile() {
    controllerLog('log', 'Config dosyası kaydediliyor (debounced)...');
    try {
        const botList = Array.from(botStore.values()).map(botState => botState.config);
        const data = JSON.stringify(botList, null, 2); 
        await writeFileAtomic(BOTS_CONFIG_PATH, data);
        controllerLog('log', 'Config dosyası başarıyla kaydedildi.');
    } catch (err) {
        controllerLog('error', `Config dosyası kaydedilemedi: ${err.message}`);
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
                changed: { status: 'stopped', stats: { inventory: [] } } 
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
            
        } else {
            if (code === 0) {
                logger.log(botName, botExitedMessage + " (Planned stop)");
            } else {
                logger.warn(botName, botExitedMessage + " (Crashed, autoReconnect is off)");
            }
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

    // GÜNCELLENDİ: v5.0.1 - MIME Hatası Düzeltmesi
    // 'public' klasörünü kök olarak sun
    app.use(express.static(path.join(__dirname, 'public')));
    
    // '/css' ve '/js' yollarını *açıkça* 'public/css' ve 'public/js' klasörlerine yönlendir.
    // Bu, 'MIME type' hatasını çözecektir.
    app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
    app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

    app.use(express.json());

    // API Endpointleri (botStore kullanıyor)
    app.get('/bots/status', (req, res) => {
        const statusList = Array.from(botStore.values()).map(botState => ({
            name: botState.config.name,
            status: botState.status,
            behavior: botState.config.behavior
        }));
        res.json(statusList);
    });

    app.post('/bots/start/:botName', (req, res) => {
        const { botName } = req.params;
        const botState = botStore.get(botName);
        if (!botState) {
            return res.status(404).json({ error: `Bot '${botName}' not found in config.` });
        }
        if (botState.process) {
            return res.status(400).json({ error: `Bot '${botName}' is already running.` });
        }
        if (startBot(botState.config)) {
            res.json({ success: true, message: `Bot '${botName}' started.` });
        } else {
            res.status(500).json({ error: `Failed to start bot '${botName}'.` });
        }
    });

    app.post('/bots/command/:botName', (req, res) => {
        const { botName } = req.params;
        const { command, args } = req.body; 
        if (!command) {
            return res.status(400).json({ error: 'Missing "command" in request body.' });
        }
        const botState = botStore.get(botName);
        if (!botState || !botState.process) {
            return res.status(404).json({ error: `Bot '${botName}' is not running.` });
        }
        if (sendCommandToBot(botName, command, args || [])) {
            res.json({ success: true, message: `Command '${command}' sent to ${botName}.` });
        } else {
            res.status(500).json({ error: `Failed to send command to bot '${botName}'.` });
        }
    });


    // Socket.io Dinleyicileri (v3.0 Delta Sync)
    io.on('connection', (socket) => {
        controllerLog('log', 'Web Arayüzü bağlandı.');
        
        const fullState = Array.from(botStore.entries()).map(([name, botState]) => ({
            name: name,
            config: botState.config,
            status: botState.status,
            stats: botState.stats
        }));
        socket.emit('full_state', fullState); 

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
            const { target, fullCommand } = data;
            if (!target || !fullCommand) return;
            const parts = fullCommand.trim().split(' ');
            const command = parts.shift();
            const args = parts;
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
        
        socket.on('config_add_bot', async (botData) => {
            if (!botData || !botData.name) {
                controllerLog('error', 'Geçersiz bot config verisi alındı.');
                return;
            }
            const botName = botData.name;
            controllerLog('log', `Web'den 'Bot Ekle/Güncelle' komutu: ${botName}`);
            
            const isNewBot = !botStore.has(botName);
            const existingState = botStore.get(botName) || {
                process: null,
                stats: { inventory: [] }, 
                status: 'stopped'
            };
            
            botStore.set(botName, { ...existingState, config: botData });
            debouncedSaveConfig();
            
            if (isNewBot) {
                io.emit('bot_added', {
                    name: botName,
                    config: botData,
                    status: 'stopped',
                    stats: { inventory: [] } 
                });
            } else {
                io.emit('bot_delta', {
                    name: botName,
                    changed: { config: botData }
                });
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
                }
            } else {
                 controllerLog('error', `Silinmek istenen bot config'de bulunamadı: ${botName}`);
            }
        });
        
        socket.on('config_get_bot', (botName) => {
            const botState = botStore.get(botName);
            if (botState) socket.emit('config_show_bot', botState.config);
        });

        socket.on('disconnect', () => {
            controllerLog('log', 'Web Arayüzü bağlantısı kesildi.');
        });
    });

    server.listen(API_PORT, () => {
        logger.log(CONTROLLER_PREFIX, `Web Panel & API http://localhost:${API_PORT} adresinde çalışıyor`);
    });
}

// Ana Fonksiyon
function main() {
    logger.log(CONTROLLER_PREFIX, 'MineBot Controller starting...');
    
    try {
        if (!fs.existsSync(BOTS_CONFIG_PATH)) {
            fs.writeFileSync(BOTS_CONFIG_PATH, '[]', 'utf8');
            logger.warn(CONTROLLER_PREFIX, `bots.json bulunamadı, boş dosya oluşturuldu.`);
        }
        
        const configFile = fs.readFileSync(BOTS_CONFIG_PATH, 'utf8');
        const bots = JSON.parse(configFile);
        
        for (const botConfig of bots) {
            botStore.set(botConfig.name, {
                config: botConfig,
                process: null,
                stats: { inventory: [] }, 
                status: 'stopped'
            });
        }
        logger.log(CONTROLLER_PREFIX, `Loaded ${botStore.size} bot configurations.`);
    } catch (err) {
        logger.error(CONTROLLER_PREFIX, `Config okunamadı: ${err.message}`);
        return;
    }

    startAPIServer();
}

main();