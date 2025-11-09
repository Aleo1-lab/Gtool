// behaviors/rtp.js
module.exports = function (bot, params) {
    bot.once('spawn', () => {
        const rtpCommand = params.command || '/rtpanadünya';
        bot.chat(rtpCommand);
    });
};