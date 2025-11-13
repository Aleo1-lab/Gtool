// behaviors/login_example.js (v5.7 - Entity Activate Düzeltmesi)

const { Vec3 } = require('vec3');

// Gecikme (delay) için yardımcı fonksiyon
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * v5.7 Async Behavior Signature
 * @param {import('mineflayer').Bot} bot - Mineflayer bot instance
 * @param {function(string, string): void} sendToController - IPC log (type, message)
 * @param {object} params - JSON params from config
 * @param {object} utils - { GoalBlock } gibi yardımcılar
 */
module.exports = async (bot, sendToController, params, utils) => {
    
    const { GoalBlock } = utils;
    
    if (!GoalBlock) {
        throw new Error("Behavior script'i 'GoalBlock' utility'sini bot.js'den alamadı. bot.js'i kontrol et.");
    }
    
    sendToController('log', 'Login script (v5.7 Entity) başladı.');

    // --- Parametreleri Kontrol Et ---
    const password = params.password;
    const loginCoords = params.login_coords; 
    const hitCoords = params.hit_coords; // Artık "entity"nin koordinatı     

    if (!password) {
        throw new Error("Params (JSON) içinde 'password' alanı eksik! '/gir <şifre>' komutu çalıştırılamadı.");
    }
    if (!loginCoords || !loginCoords.x || !loginCoords.y || !loginCoords.z) {
        throw new Error("Params (JSON) içinde 'login_coords' (x, y, z) alanı eksik! Gidilecek yer bilinmiyor.");
    }
    if (!hitCoords || !hitCoords.x || !hitCoords.y || !hitCoords.z) {
         throw new Error("Params (JSON) içinde 'hit_coords' (x, y, z) alanı eksik! Etkileşim noktası bilinmiyor.");
    }

    // --- Robust Login/Spawn Mantığı (v5.6 - Değişiklik yok) ---
    const spawnPromise = new Promise((resolve) => {
        bot.once('spawn', () => resolve('spawn'));
    });
    const messagePromise = new Promise((resolve) => {
        const onMessage = (jsonMsg) => {
            const msg = jsonMsg.toString().toLowerCase();
            if (msg.includes('giriş') || msg.includes('login') || msg.includes('kayıt') || msg.includes('şifre')) {
                bot.removeListener('message', onMessage); 
                resolve('message');
            }
        };
        bot.on('message', onMessage);
    });
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('timeout'), 5000); 
    });
    sendToController('log', 'Yarış başlatıldı: (spawn) vs (message) vs (5sn timeout)...');
    const winner = await Promise.race([spawnPromise, messagePromise, timeoutPromise]);
    let needsSpawnWait = false;
    switch (winner) {
        case 'spawn':
            sendToController('log', 'Yarışı "spawn" kazandı. (Normal Sunucu). Giriş yapılıyor...');
            bot.chat(`/gir ${password}`);
            break;
        case 'message':
            sendToController('log', 'Yarışı "message" kazandı. (Konuşkan Lobi). Giriş yapılıyor...');
            bot.chat(`/gir ${password}`);
            needsSpawnWait = true;
            break;
        case 'timeout':
            sendToController('log', 'Yarışı "timeout" kazandı. (Sessiz Lobi). Giriş yapılıyor...');
            bot.chat(`/gir ${password}`);
            needsSpawnWait = true;
            break;
    }
    if (needsSpawnWait) {
        sendToController('log', 'Giriş komutu yollandı, dünyaya ışınlanma (spawn) bekleniyor...');
        await spawnPromise;
    }
    sendToController('log', 'Spawn/Login aşaması tamamlandı. Script devam ediyor.');
    await delay(1000); 
    
    // --- Adım 2: Login Koordinatına Git ---
    sendToController('log', `Login alanına gidiliyor: X:${loginCoords.x} Y:${loginCoords.y} Z:${loginCoords.z}`);
    
    const goal = new GoalBlock(loginCoords.x, loginCoords.y, loginCoords.z);
    await bot.pathfinder.goto(goal);

    sendToController('log', 'Login alanına ulaşıldı.');
    await delay(1000); 

    // --- DÜZELTME: Adım 3 (Blok yerine Entity Bul ve Aktive Et) ---
    sendToController('log', `Hedef varlık (entity) aranıyor: ~X:${hitCoords.x} Y:${hitCoords.y} Z:${hitCoords.z}`);
    
    const hitVec = new Vec3(hitCoords.x, hitCoords.y, hitCoords.z);
    let targetEntity = null;
    let minDistance = 5; // Vuruş koordinatının 5 blok etrafında ara

    // Bottaki tüm varlıkları tara
    for (const id in bot.entities) {
        const entity = bot.entities[id];
        if (entity === bot.entity) continue; // Kendimiz hariç
        
        const dist = entity.position.distanceTo(hitVec);
        if (dist < minDistance) {
            minDistance = dist;
            targetEntity = entity;
        }
    }

    if (!targetEntity) {
        throw new Error(`Hedef (${hitCoords.x}, ${hitCoords.y}, ${hitCoords.z}) koordinatına yakın bir varlık (entity) bulunamadı.`);
    }

    // Varlık bulundu! (Muhtemelen görünmez Armor Stand)
    sendToController('log', `Varlık bulundu: ${targetEntity.name || targetEntity.username} (Tip: ${targetEntity.type}, Mesafe: ${minDistance.toFixed(2)}m). Aktive ediliyor (Sağ Tık)...`);
    
    // bot.dig() (Sol Tık) YERİNE bot.activateEntity() (Sağ Tık) kullan
    await bot.activateEntity(targetEntity);

    sendToController('log', 'Login script (login_example.js) başarıyla tamamlandı.');
};