// behaviors/tasks/test_say.js

/**
 * GTool Test Görevi: test_say
 * Belirlenen mesajı, belirlenen sayıda sohbet_gecikmesi ile söyler.
 * * @param {object} bot - Mineflayer bot örneği.
 * @param {function} sendTaskLog - Görev loguna (ve canlı yayına) mesaj gönderme fonksiyonu.
 * @param {object} params - Görev parametreleri (tasks.json'dan gelir).
 * @param {object} utils - Bot.js'den gelen yardımcı fonksiyonlar (örn: GoalBlock).
 */
module.exports = async (bot, sendTaskLog, params, utils) => {
    
    // Parametreleri doğrula ve varsayılan değerleri ata
    const message = params.message || "GTool Task Sistemi Testi!";
    const count = parseInt(params.count) || 3;
    const delay = parseInt(params.delay_ms) || 2000;

    sendTaskLog(`Görev başladı: ${count} kez '${message}' mesajı ${delay}ms ara ile söylenecek.`);

    for (let i = 0; i < count; i++) {
        sendTaskLog(`(${i + 1}/${count}) Söyleniyor: ${message}`);
        bot.chat(message);
        
        // Son mesaj değilse bekle
        if (i < count - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    sendTaskLog(`Görev tamamlandı. ${count} mesaj gönderildi.`);
};