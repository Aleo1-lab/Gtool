// behaviors/idle.js (v5.2)

/**
 * v5.2 Async Behavior Signature
 * @param {import('mineflayer').Bot} bot - Mineflayer bot instance
 * @param {function(string, string): void} sendToController - IPC log (type, message)
 * @param {object} params - JSON params from config
 * @param {object} utils - { GoalBlock } gibi yardımcılar
 */
module.exports = async (bot, sendToController, params, utils) => {
    // idle.js 'async' olmadığı ve hemen bittiği için 'await' kullanmıyoruz.
    // 'loadBehavior' içindeki try/catch bloğu bunu sorunsuz çalıştıracaktır.
    sendToController('log', 'Bot is now idle 💤. Behavior loaded.');
};