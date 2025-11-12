// behaviors/login_example.js (v5.2)

// YENİ: require('mineflayer-pathfinder') kaldırıldı.

// Gecikme (delay) için yardımcı fonksiyon
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * v5.2 Async Behavior Signature
 * @param {import('mineflayer').Bot} bot - Mineflayer bot instance
 * @param {function(string, string): void} sendToController - IPC log (type, message)
 * @param {object} params - JSON params from config
 * @param {object} utils - { GoalBlock } gibi yardımcılar
 */
module.exports = async (bot, sendToController, params, utils) => {
    
    // YENİ: GoalBlock'u 'require' yerine 'utils' parametresinden al
    const { GoalBlock } = utils;
    
    // GoalBlock'un gelip gelmediğini kontrol et (hata ayıklama için)
    if (!GoalBlock) {
        throw new Error("Behavior script'i 'GoalBlock' utility'sini bot.js'den alamadı. bot.js'i kontrol et.");
    }
    
    sendToController('log', 'Login script (login_example.js) başladı.');

    // --- Parametreleri Kontrol Et ---
    const password = params.password;
    const loginCoords = params.login_coords; // Örn: { x: 100, y: 65, z: -50 }
    const hitCoords = params.hit_coords;     // Örn: { x: 102, y: 65, z: -50 }

    if (!password) {
        throw new Error("Params (JSON) içinde 'password' alanı eksik! '/gir <şifre>' komutu çalıştırılamadı.");
    }
    if (!loginCoords || !loginCoords.x || !loginCoords.y || !loginCoords.z) {
        throw new Error("Params (JSON) içinde 'login_coords' (x, y, z) alanı eksik! Gidilecek yer bilinmiyor.");
    }
    if (!hitCoords || !hitCoords.x || !hitCoords.y || !hitCoords.z) {
         throw new Error("Params (JSON) içinde 'hit_coords' (x, y, z) alanı eksik! Vurulacak blok bilinmiyor.");
    }

    // --- Adım 1: Login Komutunu Gir ---
    await delay(2000); 
    sendToController('log', `Sunucuya giriş komutu yollanıyor: /gir ${password.substring(0, 1)}...`);
    bot.chat(`/gir "${password}"`);
    
    sendToController('log', 'Girişin doğrulanması ve dünyaya ışınlanma bekleniyor (max 10 saniye)...');
    await delay(5000); 

    // --- Adım 2: Login Koordinatına Git ---
    sendToController('log', `Login alanına gidiliyor: X:${loginCoords.x} Y:${loginCoords.y} Z:${loginCoords.z}`);
    
    const goal = new GoalBlock(loginCoords.x, loginCoords.y, loginCoords.z);
    await bot.pathfinder.goto(goal);

    sendToController('log', 'Login alanına ulaşıldı.');
    await delay(1000); 

    // --- Adım 3: Hedef Bloka Vur (veya Aktive Et) ---
    sendToController('log', `Hedef bloka vuruluyor: X:${hitCoords.x} Y:${hitCoords.y} Z:${hitCoords.z}`);
    
    const targetBlock = bot.blockAt(new bot.registry.Vec3(hitCoords.x, hitCoords.y, hitCoords.z));
    
    if (!targetBlock) {
        throw new Error(`Hedef (${hitCoords.x}, ${hitCoords.y}, ${hitCoords.z}) koordinatında vurulacak blok bulunamadı veya chunk yüklenmedi.`);
    }

    if (targetBlock.name.includes('button') || targetBlock.name.includes('door')) {
        sendToController('log', `Blok bir düğme/kapı (${targetBlock.name}). Aktive ediliyor...`);
        await bot.activateBlock(targetBlock);
    } else {
        sendToController('log', `Blok (${targetBlock.name}). Vuruluyor...`);
        await bot.dig(targetBlock);
    }

    sendToController('log', 'Login script (login_example.js) başarıyla tamamlandı.');
};