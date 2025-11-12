// bot.js (v5.4)
const mineflayer = require('mineflayer');
const path = require('path');
const { SocksProxyAgent } = require('socks-proxy-agent');

// GÜNCELLENDİ: v5.4 - Pathfinder'ı DOĞRU import etme
// Plugin'i, Movements'ı ve Goals'u ana 'require'dan al
const pathfinder = require('mineflayer-pathfinder');
const Movements = pathfinder.Movements;
const Goals = pathfinder.goals;
const { GoalBlock } = Goals; // <-- HATA BURADA DÜZELTİLDİ

let bot;
let botConfig;
let automationConfig = { autoEat: false, foodToEat: [] };
let statsInterval = null; 
let botState = 'IDLE'; 
let mcData;

let behaviorLoaded = false;
let lastInventoryHash = '';

function sendToController(type, payload) {
    if (process.send) {
        process.send({ type, payload });
    }
}

function getNearbyEntities() {
    const entities = [];
    if (!bot || !bot.entities || !bot.entity || !bot.entity.position) {
        return entities;
    }
    for (const id in bot.entities) {
        const entity = bot.entities[id];
        if (entity === bot.entity) continue; 
        const dist = bot.entity.position.distanceTo(entity.position);
        if (dist > 32) continue; 
        let entityType = 'Object'; 
        if (entity.type === 'player') entityType = 'Player';
        else if (entity.type === 'mob') entityType = 'Mob';
        entities.push({
            name: entity.username || entity.name || 'Bilinmeyen Varlık',
            type: entityType,
            distance: dist.toFixed(1)
        });
    }
    entities.sort((a, b) => a.distance - b.distance);
    return entities.slice(0, 5);
}

function sendCoreStats() {
    if (bot && bot.entity && bot.health != null && bot.food != null) {
        
        const nearbyEntities = getNearbyEntities(); 
        
        const newStatsPayload = {
            health: bot.health,
            food: bot.food,
            pos: bot.entity.position,
            state: botState,
            nearbyEntities: nearbyEntities 
        };
        
        sendToController('stats', newStatsPayload);
    }
}

function sendInventoryStats() {
    if (!bot || !bot.inventory) return;
    
    const currentHash = JSON.stringify(bot.inventory.items().map(i => i.slot + i.name + i.count));
    if (currentHash !== lastInventoryHash) {
        lastInventoryHash = currentHash;
        sendToController('stats', { 
            inventory: bot.inventory.items()
        });
    }
}

function onTick() {
    sendCoreStats(); 
}

async function loadBehavior() {
    if (behaviorLoaded) {
        sendToController('log', 'Behavior önceden yüklenmişti, tekrar yüklenmiyor (BungeeCord transferi?).');
        return;
    }
    behaviorLoaded = true; 
    const behaviorName = botConfig.behavior || 'idle'; 
    sendToController('status', `Loading behavior: ${behaviorName}...`);
    
    try {
        const behaviorPath = path.join(__dirname, 'behaviors', `${behaviorName}.js`);
        delete require.cache[require.resolve(behaviorPath)];
        const behavior = require(behaviorPath);
        
        const utils = { GoalBlock };
        
        sendToController('log', `Behavior '${behaviorName}' executing...`);
        await behavior(bot, sendToController, botConfig.params || {}, utils);
        sendToController('log', `Behavior '${behaviorName}' finished successfully.`);
        
    } catch (err) {
        sendToController('error', `[BEHAVIOR ERROR] '${behaviorName}' script failed: ${err.message}`);
        console.error(err); 
    } finally {
        sendToController('status', 'Behavior execution finished or caught error.');
    }
}

function connect() {
    lastInventoryHash = '';
    sendToController('status', `Connecting to ${botConfig.host}:${botConfig.port}...`);

    const options = {
        host: botConfig.host,
        port: parseInt(botConfig.port || 25565), 
        username: botConfig.username,
        version: botConfig.version,
        auth: botConfig.auth || 'offline'
    };

    if (botConfig.proxy && botConfig.proxy.host && botConfig.proxy.port) {
        const proxyHost = botConfig.proxy.host;
        const proxyPort = parseInt(botConfig.proxy.port);
        sendToController('log', `Connecting via proxy: ${proxyHost}:${proxyPort}`);
        const agent = new SocksProxyAgent(`socks5://${proxyHost}:${proxyPort}`);
        options.agent = agent;
        options.connect = (client) => {
            client.setSocket(agent.createSocket({
                host: options.host,
                port: options.port
            }));
        };
    }

    bot = mineflayer.createBot(options);
    
    // GÜNCELLENDİ: v5.4 - Plugin'i 'pathfinder' değişkeniyle yükle
    bot.loadPlugin(pathfinder.pathfinder);
    
    bot.on('login', () => {
        sendToController('status', 'Connected to server (login event fired).');
        mcData = require('minecraft-data')(bot.version);
        
        // GÜNCELLENDİ: v5.4 - 'Movements' sınıfını doğru kullan
        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);
    });

    bot.on('spawn', async () => {
        sendToController('status', 'Bot spawned in world. Starting/Resetting stats reporting.');
        
        await loadBehavior(); 
        
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = setInterval(onTick, 3000); 
        onTick(); 
        
        bot.on('windowUpdate', sendInventoryStats); 
        sendInventoryStats(); 
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) {
            sendToController('log', `Sent chat: ${message}`);
        }
    });

    bot.on('kicked', (reason, loggedIn) => {
        sendToController('error', `Kicked! Reason: ${JSON.stringify(reason)}`);
        behaviorLoaded = false;
        if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
        process.exit(1);
    });

    bot.on('error', (err) => {
        sendToController('error', `Mineflayer Error: ${err.message}`);
        if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
        process.exit(1); 
    });

    bot.on('end', (reason) => {
        sendToController('status', `Disconnected. Reason: ${reason}`);
        if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
        behaviorLoaded = false; 
        process.exit(1);
    });
}

process.on('message', (message) => {
    const { type, command, args } = message;

    if (type === 'init') {
        botConfig = message.config;
        automationConfig = botConfig.automation || { autoEat: false, foodToEat: [] };
        sendToController('status', `Process started. Initializing bot: ${botConfig.name}`);
        connect();
        return; 
    }

    if (type === 'command') {
        if (!bot || !bot.entity) {
            sendToController('error', `Cannot execute command: Bot is not ready or spawned.`);
            return;
        }
        switch (command) {
            case 'say':
                bot.chat(args.join(' '));
                break;
            case 'move':
                botState = 'BUSY'; 
                const moveDir = args[0]; 
                if (['forward', 'back', 'left', 'right', 'sprint'].includes(moveDir)) {
                    const time = parseInt(args[1] || 1000);
                    sendToController('log', `[MANUEL] Moving ${moveDir} for ${time}ms...`);
                    bot.setControlState(moveDir, true);
                    setTimeout(() => { 
                        bot.setControlState(moveDir, false);
                        botState = 'IDLE'; 
                    }, time);
                } else {
                    sendToController('error', `Invalid move direction: ${moveDir}`);
                    botState = 'IDLE';
                }
                break;
            case 'turn':
                const turnDir = args[0];
                const yawMap = { north: Math.PI, east: -Math.PI / 2, south: 0, west: Math.PI / 2 };
                if (yawMap.hasOwnProperty(turnDir)) {
                    bot.look(yawMap[turnDir], 0, true);
                    sendToController('log', `[MANUEL] Turned ${turnDir}`);
                } else {
                    sendToController('error', `Invalid turn direction: ${turnDir}`);
                }
                break;
            case 'jump':
                if (bot.entity.onGround) {
                    sendToController('log', '[MANUEL] Jumped!');
                    bot.setControlState('jump', true);
                    bot.setControlState('jump', false);
                } else {
                    sendToController('log', 'Cannot jump while in the air.');
                }
                break;
            case 'stop':
                botState = 'BUSY';
                sendToController('status', 'Stopping by controller command...');
                if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
                bot.quit();
                process.exit(0); 
                break;
            default:
                sendToController('warn', `Unknown command: ${command}`);
        }
    }
});

process.on('unhandledRejection', (reason, promise) => {
  sendToController('error', `[KRİTİK HATA] Unhandled Rejection at: ${promise}, reason: ${reason}`);
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
  process.exit(1);
});