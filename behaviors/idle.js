// behaviors/idle.js
module.exports = function (bot, params) {
    bot.once('spawn', () => {
        // 'sendToController' fonksiyonu bot.js'de tanımlı,
        // ancak bu modülün ona erişimi yok.
        // Bu yüzden loglama için bot.chat kullanmak en kolayı.
        bot.chat('Bot is now idle 💤. Behavior loaded.');
    });
};