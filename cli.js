#!/usr/bin/env node
// cli.js
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const axios = require('axios');
const chalk = require('chalk'); // Renkli çıktı için (zaten kurulu chalk@4)

const API_BASE_URL = 'http://localhost:4000';

// Hata yönetimini merkezileştiren yardımcı fonksiyon
async function handleRequest(requestPromise) {
    try {
        const response = await requestPromise;
        return response.data;
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            console.error(chalk.red.bold('HATA: Controller API\'sine bağlanılamadı.'));
            console.error(chalk.yellow('`node controller.js` komutunun çalıştığından emin olun.'));
        } else if (err.response) {
            // API'den gelen hata (404, 400, 500 vb.)
            console.error(chalk.red.bold(`API Hatası (${err.response.status}):`), chalk.white(err.response.data.error));
        } else {
            // Diğer hatalar
            console.error(chalk.red.bold('Bilinmeyen Hata:'), err.message);
        }
        process.exit(1); // Hata durumunda çık
    }
}

yargs(hideBin(process.argv))
    .command(
        'list',
        'Tüm botların durumunu listeler',
        () => {},
        async (argv) => {
            const data = await handleRequest(axios.get(`${API_BASE_URL}/bots/status`));
            if (data) {
                console.log(chalk.bold.underline('Bot Durumları:'));
                data.forEach(bot => {
                    const status = bot.status === 'running'
                        ? chalk.green('Running')
                        : chalk.gray('Stopped');
                    console.log(`- ${chalk.cyan(bot.name.padEnd(15))} [${status}] (Behavior: ${bot.behavior})`);
                });
            }
        }
    )
    .command(
        'start <botName>',
        'İsmi belirtilen botu başlatır',
        (yargs) => {
            yargs.positional('botName', {
                describe: 'Başlatılacak botun adı (config/bots.json içindeki)',
                type: 'string',
            });
        },
        async (argv) => {
            const data = await handleRequest(axios.post(`${API_BASE_URL}/bots/start/${argv.botName}`));
            if (data) {
                console.log(chalk.green('Başarılı:'), data.message);
            }
        }
    )
    .command(
        'stop <botName>',
        'Çalışan bir botu durdurur',
        (yargs) => {
            yargs.positional('botName', {
                describe: 'Durdurulacak botun adı',
                type: 'string',
            });
        },
        async (argv) => {
            const body = { command: 'stop', args: [] };
            const data = await handleRequest(axios.post(`${API_BASE_URL}/bots/command/${argv.botName}`, body));
            if (data) {
                console.log(chalk.yellow('Başarılı:'), data.message);
            }
        }
    )
    .command(
        'send <botName> <command> [args...]', // Bu satır [args...] sayesinde zaten diziyi toplar
        'Çalışan bir bota komut gönderir',
        (yargs) => {
            // Sadece botName ve command'ı tanımlamamız yeterli
            yargs.positional('botName', {
                describe: 'Botun adı',
                type: 'string',
            });
            yargs.positional('command', {
                describe: 'Gönderilecek komut (say, move, vb.)',
                type: 'string',
            });
            // yargs.array('args', ...) satırını buradan sildik.
        },
        async (argv) => {
            // Artık argv.args [args...] sayesinde doğru şekilde dolacak
            const body = { command: argv.command, args: argv.args || [] };
            const data = await handleRequest(axios.post(`${API_BASE_URL}/bots/command/${argv.botName}`, body));
            if (data) {
                console.log(chalk.blue('Komut Gönderildi:'), data.message);
            }
        }
    )
    .demandCommand(1, 'Bir komut girmelisiniz. (list, start, stop, send)')
    .strict() // Bilinmeyen komutları engeller
    .help()
    .argv;