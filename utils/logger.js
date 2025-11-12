// logger.js (Sadeleştirilmiş)
const chalk = require('chalk');

function print(prefix, message, color = chalk.white) {
    const time = new Date().toLocaleTimeString(); // ISO yerine sade saat
    console.log(`${chalk.gray(time)} ${chalk.cyan(prefix.padEnd(15))} ${color(message)}`);
}

exports.log = (p, m) => print(p, m);
exports.error = (p, m) => print(p, m, chalk.red);
exports.warn = (p, m) => print(p, m, chalk.yellow);