// bot.js
const mineflayer = require('mineflayer');
const path = require('path');
const { SocksProxyAgent } = require('socks-proxy-agent'); // YENİ: Proxy için

let bot;
let botConfig;
let automationConfig = { autoEat: false, foodToEat: [] };
let statsInterval = null; 
let botState = 'IDLE'; 
let mcData;

function sendToController(type, payload) {
    if (process.send) {
        process.send({ type, payload });
    }
}

function sendStats() {
    if (bot && bot.entity && bot.health != null && bot.food != null) {
        sendToController('stats', {
            health: bot.health,
            food: bot.food,
            pos: bot.entity.position,
            state: botState 
        });
    }
}

function onTick() {
    sendStats(); 
    checkAutomation();
}

async function checkAutomation() {
    if (botState !== 'IDLE') return;

    if (automationConfig.autoEat === true && bot.food < 18) {
        botState = 'BUSY';
        try {
            await startAutoEat();
        } catch (err) {
            sendToController('error', `[OTOMASYON] AutoEat'te kritik hata: ${err.message}`);
        } finally {
            botState = 'IDLE';
        }
    }
}

async function startAutoEat() {
    sendToController('status', `[OTOMASYON] Açlık (${bot.food}/20). Yemek aranıyor...`);

    const foodItemsToFind = automationConfig.foodToEat || [];
    let foodToEat = null;

    for (const itemName of foodItemsToFind) {
         if (!mcData || !mcData.itemsByName[itemName]) {
            sendToController('warn', `[OTOMASYON] Bilinmeyen yemek adı: ${itemName}`);
            continue;
        }
        const item = bot.inventory.findInventoryItem(mcData.itemsByName[itemName].id);
        if (item) {
            foodToEat = item;
            break; 
        }
    }

    if (foodToEat) {
        sendToController('log', `[OTOMASYON] Envanterde bulundu: ${foodToEat.name}. Yeniliyor...`);
        await bot.equip(foodToEat, 'hand');
        await bot.consume();
        sendToController('status', `[OTOMASYON] Beslenme tamamlandı. (Açlık: ${bot.food}/20)`);
    } else {
        sendToController('warn', `[OTOMASYON] Yemek yenecekti ama envanterde listedeki yiyecekler bulunamadı.`);
    }
}


function loadBehavior() {
    const behaviorName = botConfig.behavior || 'idle'; 
    sendToController('status', `Loading behavior: ${behaviorName}...`);
    
    try {
        const behaviorPath = path.join(__dirname, 'behaviors', `${behaviorName}.js`);
        delete require.cache[require.resolve(behaviorPath)];
        const behavior = require(behaviorPath);
        behavior(bot, botConfig.params || {});
        sendToController('log', `Behavior '${behaviorName}' loaded successfully.`);
    } catch (err) {
        sendToController('error', `Failed to load behavior '${behaviorName}': ${err.message}`);
    }
}

function connect() {
    sendToController('status', `Connecting to ${botConfig.host}:${botConfig.port}...`);

    // --- YENİ: Proxy Mantığı ---
    const options = {
        host: botConfig.host,
        port: parseInt(botConfig.port || 25565), // Portun sayı olduğundan emin ol
        username: botConfig.username,
        version: botConfig.version,
        auth: botConfig.auth || 'offline'
    };

    if (botConfig.proxy && botConfig.proxy.host && botConfig.proxy.port) {
        const proxyHost = botConfig.proxy.host;
        const proxyPort = parseInt(botConfig.proxy.port);
        sendToController('log', `Connecting via proxy: ${proxyHost}:${proxyPort}`);
        
        // socks-proxy-agent formatı: 'socks5://host:port'
        const agent = new SocksProxyAgent(`socks5://${proxyHost}:${proxyPort}`);
        options.agent = agent;
        
        // Mineflayer'ın proxy ile çalışması için bu özel 'connect' fonksiyonu gerekebilir
        options.connect = (client) => {
            client.setSocket(agent.createSocket({
                host: options.host,
                port: options.port
            }));
        };
    }
    // --- Proxy Mantığı Bitti ---

    bot = mineflayer.createBot(options);
    
    mcData = require('minecraft-data')(bot.version);

    // --- Olaylar ---

    bot.on('login', () => {
        sendToController('status', 'Connected to server.');
        loadBehavior();
    });

    bot.once('spawn', () => {
        sendToController('status', 'Bot spawned in world. Starting stats reporting.');
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = setInterval(onTick, 3000); 
        onTick(); 
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) {
            sendToController('log', `Sent chat: ${message}`);
        }
    });

    bot.on('kicked', (reason, loggedIn) => {
        sendToController('error', `Kicked! Reason: ${JSON.stringify(reason)}`);
        process.exit(1);
    });

    bot.on('error', (err) => {
        sendToController('error', `Mineflayer Error: ${err.message}`);
    });

    bot.on('end', (reason) => {
        sendToController('status', `Disconnected. Reason: ${reason}`);
        if (statsInterval) clearInterval(statsInterval);
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
                if (statsInterval) clearInterval(statsInterval);
                bot.quit();
                process.exit(0);
                break;
            
            default:
                sendToController('warn', `Unknown command: ${command}`);
        }
    }
});