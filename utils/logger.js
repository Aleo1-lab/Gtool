// utils/logger.js
const chalk = require('chalk');

// Renkleri önceden tanımlayalım
const timeColor = chalk.gray;
const prefixColor = chalk.cyan;
const errorColor = chalk.red;
const warnColor = chalk.yellow;

function print(prefix, message, colorizer = (msg) => msg) {
    const time = new Date().toISOString();
    const formattedPrefix = prefixColor(`[${prefix.padEnd(15, ' ')}]`); // Sabit genişlik için
    console.log(`${timeColor(`[${time}]`)} ${formattedPrefix} ${colorizer(message)}`);
}

exports.log = (prefix, message) => {
    print(prefix, message);
};

exports.error = (prefix, message) => {
    print(prefix, message, errorColor);
};

exports.warn = (prefix, message) => {
    print(prefix, message, warnColor);
};