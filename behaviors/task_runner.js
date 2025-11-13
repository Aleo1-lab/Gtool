// behaviors/task_runner.js
const path = require('path');
const fs = require('fs'); // Gerekli değil, sadece path için.

/**
 * GTool Task Runner (v6.0)
 * Bu script, 'controller.js' tarafından yönetilen bir görev kuyruğunu sonsuz
 * bir döngü içinde yürüten "meta-behavior" script'idir.
 * * bot.js (v5.4) imzasıyla çalışır:
 * async (bot, sendToController, params, utils)
 */
module.exports = async (bot, sendToController, params, utils) => {

    const botName = bot.username || botConfig.name;
    sendToController('log', `Task Runner Behavior başlatıldı. [${botName}] görev döngüsüne giriyor...`);

    let currentTask = null;

    /**
     * Controller'dan 'nextTask' IPC mesajını bekler.
     * @returns {Promise<object | null>} Görev nesnesi veya null (kuyruk boşsa)
     */
    function waitForNextTask() {
        return new Promise((resolve) => {
            
            const listener = (message) => {
                if (message.type === 'nextTask') {
                    process.removeListener('message', listener); // Dinleyiciyi temizle
                    currentTask = message.task; // Mevcut görevi sakla
                    resolve(message.task); // Görevi (veya null) döndür
                }
            };
            process.on('message', listener);

            // Controller'a "Hazırım, görev yolla" sinyalini gönder
            sendToController('status', 'IDLE - Sıradaki görev bekleniyor...');
            sendToController('getNextTask', { botName: botName });
        });
    }

    /**
     * Alt göreve (örn: mine.js) verilecek özel loglama fonksiyonu.
     * Bu fonksiyon, logu 'task_log' tipiyle controller'a yollar.
     * @param {string} message Log mesajı
     */
    function sendTaskLog(message) {
        if (!currentTask) return; // Görev yoksa log atma
        
        sendToController('task_log', {
            botName: botName,
            taskId: currentTask.id,
            message: message
        });
    }

    // --- SONSUZ GÖREV DÖNGÜSÜ ---
    while (true) {
        const task = await waitForNextTask(); // Controller'dan görev blokesi

        if (task === null) {
            // Kuyruk boş. 30 saniye bekle ve tekrar kontrol et.
            // sendTaskLog('Görev kuyruğu boş. 30sn bekliyorum...'); // Log atamayız çünkü task=null
            await new Promise(r => setTimeout(r, 30000));
            continue; // Döngü başa döner ve tekrar görev ister
        }

        // Görev bulundu!
        sendToController('status', `BUSY - Görev yürütülüyor: ${task.scriptName}`);
        sendTaskLog(`GÖREV BAŞLADI: ${task.scriptName} (ID: ${task.id})`);
        
        try {
            // Görev script'lerini 'behaviors/tasks/' klasöründen yükle
            const behaviorPath = path.join(__dirname, 'tasks', task.scriptName);
            
            // Script'in varlığını kontrol et
            if (!fs.existsSync(behaviorPath)) {
                throw new Error(`Görev script'i bulunamadı: ${task.scriptName}`);
            }

            delete require.cache[require.resolve(behaviorPath)]; // Cache'i temizle
            const behaviorScript = require(behaviorPath);
            
            // Script'i (örn: mine.js) çağır ve BİTMESİNİ BEKLE
            // DİKKAT: 'sendToController' yerine 'sendTaskLog' fonksiyonunu veriyoruz!
            await behaviorScript(bot, sendTaskLog, task.params || {}, utils);
            
            // Başarıyla bitti
            sendTaskLog(`GÖREV BAŞARILI: ${task.scriptName} (ID: ${task.id})`);
            sendToController('taskComplete', { botName: botName, taskId: task.id });

        } catch (err) {
            // Hata!
            const errorMessage = (err.stack || err.message || "Bilinmeyen görev hatası").toString();
            sendTaskLog(`---!!! GÖREV HATASI !!!---
Script: ${task.scriptName}
ID: ${task.id}
Hata: ${errorMessage}
---!!! HATA SONU !!!---`);
            
            sendToController('taskFailed', { botName: botName, taskId: task.id, error: errorMessage });
            
            // Hata durumunda 10sn bekle (spam'ı önle)
            await new Promise(r => setTimeout(r, 10000));
        } finally {
            currentTask = null; // Mevcut görevi temizle
        }
        // Bu görev bitti (başarılı veya hatalı), döngü başa döner ve bir sonraki görevi ister.
    }
};