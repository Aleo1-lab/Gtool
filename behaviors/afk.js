// behaviors/afk.js
module.exports = function (bot, params) {
    // 'spawn' wrapper'ı kaldırıldı. Bu kod artık 'spawn'dan SONRA çalışıyor.
    
    // Parametreleri kullanma örneği
    const afkCommand = params.command || '/afk';
    bot.chat(afkCommand);

    // Bot durduğu yerde rasgele zıplasın
    const jumpInterval = setInterval(() => {
        if (bot.entity && bot.entity.onGround) {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
        }
    }, params.jumpInterval || 8000); // Config'den ayarlanabilir

    // Bot sonlandığında interval'i temizle
    bot.on('end', () => {
        clearInterval(jumpInterval);
    });
};