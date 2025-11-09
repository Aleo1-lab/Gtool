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

const runningBots = new Map();
let botConfigurations = new Map();
const botStats = new Map();
let io; 

// --- bots.json'u Güvenli Kaydetme Fonksiyonu ---
async function saveConfigToFile() {
    controllerLog('log', 'Config dosyası kaydediliyor...');
    try {
        const botList = Array.from(botConfigurations.values());
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

    if (type === 'stats') {
        botStats.set(botName, payload);
        broadcastStatusUpdate();
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

function broadcastStatusUpdate() {
    if (!io) return; 

    const statusList = [];
    for (const [name, config] of botConfigurations.entries()) {
        const stats = botStats.get(name) || {};
        statusList.push({
            name: name,
            status: runningBots.has(name) ? 'running' : 'stopped',
            behavior: config.behavior,
            stats: stats,
            // 'Edit' butonu için config'in tamamını gönderiyoruz
            config: config 
        });
    }
    io.emit('status_update', statusList);
}


function startBot(botConfig) {
    const botName = botConfig.name;
    if (runningBots.has(botName)) {
        controllerLog('warn', `Bot ${botName} is already running.`);
        return false;
    }

    controllerLog('log', `Starting bot: ${botName}...`);
    const botProcess = fork(path.join(__dirname, 'bot.js'));

    botProcess.on('exit', (code) => {
        const botExitedMessage = `Process exited with code ${code}.`;
        logger.warn(botName, botExitedMessage);
        if (io) io.emit('log', { prefix: botName, message: botExitedMessage, type: 'warn' });
        
        runningBots.delete(botName);
        botStats.delete(botName);
        broadcastStatusUpdate(); 

        const currentConfig = botConfigurations.get(botName);
        
        if (code !== 0 && currentConfig && currentConfig.autoReconnect === true) {
            const delayInSeconds = currentConfig.reconnectDelay || 30;
            controllerLog('log', `Bot ${botName} will try to reconnect in ${delayInSeconds} seconds...`);

            setTimeout(() => {
                if (botConfigurations.has(botName)) {
                     controllerLog('log', `Attempting to restart bot: ${botName}...`);
                    startBot(currentConfig); 
                }
            }, delayInSeconds * 1000);
            
        } else if (code === 0) {
            controllerLog('log', `Bot ${botName} stopped intentionally.`);
        } else {
            controllerLog('warn', `Bot ${botName} will not reconnect.`);
        }
    });

    botProcess.on('message', (message) => {
        handleBotMessage(botName, message);
    });

    botProcess.send({ type: 'init', config: botConfig });
    runningBots.set(botName, botProcess);
    
    broadcastStatusUpdate();
    return true;
}

function sendCommandToBot(botName, command, args = []) {
    const botProcess = runningBots.get(botName);
    if (botProcess) {
        controllerLog('log', `Sending command '${command}' to ${botName}`);
        botProcess.send({ type: 'command', command, args });
        return true;
    } else {
        controllerLog('error', `Bot ${botName} is not running.`);
        return false;
    }
}

function startAPIServer() {
    const app = express();
    const server = http.createServer(app);
    io = new Server(server); 

    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());

    // --- 'cli.js' için API endpoint'leri (DOLDURULDU) ---
    app.get('/bots/status', (req, res) => {
        const statusList = [];
        for (const [name, config] of botConfigurations.entries()) {
            statusList.push({
                name: name,
                status: runningBots.has(name) ? 'running' : 'stopped',
                behavior: config.behavior
            });
        }
        res.json(statusList);
    });
    app.post('/bots/start/:botName', (req, res) => {
        const { botName } = req.params;
        const botConfig = botConfigurations.get(botName);
        if (!botConfig) {
            return res.status(404).json({ error: `Bot '${botName}' not found in config.` });
        }
        if (runningBots.has(botName)) {
            return res.status(400).json({ error: `Bot '${botName}' is already running.` });
        }
        if (startBot(botConfig)) {
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
        if (!runningBots.has(botName)) {
            return res.status(404).json({ error: `Bot '${botName}' is not running.` });
        }
        if (sendCommandToBot(botName, command, args || [])) {
            res.json({ success: true, message: `Command '${command}' sent to ${botName}.` });
        } else {
            res.status(500).json({ error: `Failed to send command to bot '${botName}'.` });
        }
    });


    // --- Socket.io Dinleyicileri (GÜNCELLENDİ) ---
    io.on('connection', (socket) => {
        controllerLog('log', 'Web Arayüzü bağlandı.');
        broadcastStatusUpdate();

        // Start
        socket.on('command_start', (botName) => {
            controllerLog('log', `Web'den 'start' komutu: ${botName}`);
            const botConfig = botConfigurations.get(botName);
            if (botConfig) {
                startBot(botConfig);
            } else {
                controllerLog('error', `Geçersiz bot adı: ${botName}`);
            }
        });

        // Stop
        socket.on('command_stop', (botName) => {
            controllerLog('log', `Web'den 'stop' komutu: ${botName}`);
            sendCommandToBot(botName, 'stop');
        });

        // --- DEĞİŞİKLİK BURADA: 'command_send' DEĞİŞTİ ---
        // Artık 'command_send' yok, 'command_send_global' var.
        socket.on('command_send_global', (data) => {
            // data = { target: '*' | 'BotName', fullCommand: 'say hello' }
            const { target, fullCommand } = data;
            
            if (!target || !fullCommand) {
                controllerLog('warn', 'Invalid command_send_global received.');
                return;
            }

            // Komut satırını ayır
            const parts = fullCommand.trim().split(' ');
            const command = parts.shift();
            const args = parts;

            if (target === '*') {
                // Hedef: Tüm *çalışan* botlar
                controllerLog('log', `GLOBAL KOMUT -> [TÜM BOTLAR]: ${command} [${args.join(', ')}]`);
                for (const botName of runningBots.keys()) {
                    sendCommandToBot(botName, command, args);
                }
            } else {
                // Hedef: Tek bot
                controllerLog('log', `GLOBAL KOMUT -> [${target}]: ${command} [${args.join(', ')}]`);
                if (runningBots.has(target)) {
                    sendCommandToBot(target, command, args);
                } else {
                    controllerLog('error', `Komut gönderilemedi: Bot ${target} çalışmıyor.`);
                }
            }
        });
        // --- DEĞİŞİKLİK BİTTİ ---
        
        // Bot Ekle/Güncelle
        socket.on('config_add_bot', async (botData) => {
            if (!botData || !botData.name) {
                controllerLog('error', 'Geçersiz bot config verisi alındı.');
                return;
            }
            controllerLog('log', `Web'den 'Bot Ekle/Güncelle' komutu: ${botData.name}`);
            botConfigurations.set(botData.name, botData);
            await saveConfigToFile();
            broadcastStatusUpdate();
        });

        // Bot Sil
        socket.on('config_delete_bot', async (botName) => {
            controllerLog('log', `Web'den 'Bot Sil' komutu: ${botName}`);
            
            if (botConfigurations.has(botName)) {
                botConfigurations.delete(botName);
                await saveConfigToFile();
                
                if (runningBots.has(botName)) {
                    controllerLog('warn', `Çalışan bot ${botName} config'den silindi, durduruluyor...`);
                    sendCommandToBot(botName, 'stop');
                }
                
                broadcastStatusUpdate();
            } else {
                 controllerLog('error', `Silinmek istenen bot config'de bulunamadı: ${botName}`);
            }
        });
        
        // Bot Düzenleme (Formu Doldur)
        socket.on('config_get_bot', (botName) => {
            const botConfig = botConfigurations.get(botName);
            if (botConfig) {
                socket.emit('config_show_bot', botConfig);
            }
        });

        socket.on('disconnect', () => {
            controllerLog('log', 'Web Arayüzü bağlantısı kesildi.');
        });
    });

    server.listen(API_PORT, () => {
        logger.log(CONTROLLER_PREFIX, `Web Panel & API http://localhost:${API_PORT} adresinde çalışıyor`);
    });
}

// --- Ana Fonksiyon (Değişiklik yok) ---
function main() {
    logger.log(CONTROLLER_PREFIX, 'MineBot Controller starting...');
    
    // 1. Başlangıçta config'i oku
    try {
        if (!fs.existsSync(BOTS_CONFIG_PATH)) {
            fs.writeFileSync(BOTS_CONFIG_PATH, '[]', 'utf8');
            logger.warn(CONTROLLER_PREFIX, `bots.json bulunamadı, boş dosya oluşturuldu.`);
        }
        
        const configFile = fs.readFileSync(BOTS_CONFIG_PATH, 'utf8');
        const bots = JSON.parse(configFile);
        
        for (const botConfig of bots) {
            botConfigurations.set(botConfig.name, botConfig);
        }
        logger.log(CONTROLLER_PREFIX, `Loaded ${botConfigurations.size} bot configurations.`);
    } catch (err) {
        logger.error(CONTROLLER_PREFIX, `Config okunamadı: ${err.message}`);
        return;
    }

    // 2. API ve Web Sunucusunu Başlat
    startAPIServer();
}

main();