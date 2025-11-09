// public/main.js
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- YENİ: Modal Elementleri ---
    const modalOverlay = document.getElementById('modal-overlay');
    const showModalButton = document.getElementById('show-add-bot-modal');
    const closeModalButton = document.getElementById('modal-close-button');

    // --- YENİ: Genel Komut Konsolu Elementleri ---
    const commandTargetSelector = document.getElementById('command-target-selector');
    const globalCommandInput = document.getElementById('global-command-input');
    const globalSendButton = document.getElementById('global-send-button');

    // Form elementleri
    const botForm = document.getElementById('add-bot-form');
    const clearButton = document.getElementById('clear-form-button');

    // Liste ve log elementleri
    const botListDiv = document.getElementById('bot-list');
    const logsPre = document.getElementById('logs');

    // =====================================================================
    // --- Socket Olay Dinleyicileri (Backend'den Gelen) ---
    // =====================================================================

    socket.on('status_update', (bots) => {
        renderBotList(bots);
    });

    socket.on('log', (log) => {
        const logElement = document.createElement('span');
        const time = new Date().toLocaleTimeString();
        logElement.className = `log-${log.type || 'log'}`;
        logElement.innerHTML = `[${time}] [${log.prefix}] ${log.message}\n`;
        logsPre.appendChild(logElement);
        logsPre.parentElement.scrollTop = logsPre.parentElement.scrollHeight;
    });

    // Controller'dan gelen bot config'i ile formu doldur (Edit için)
    socket.on('config_show_bot', (botConfig) => {
        fillForm(botConfig);
        modalOverlay.style.display = 'block'; // Formu doldurduktan sonra modal'ı aç
    });

    // =====================================================================
    // --- Arayüzü Çizen Fonksiyon ---
    // =====================================================================

    function renderBotList(bots) {
        botListDiv.innerHTML = ''; 

        // YENİ: Genel konsolun hedef (target) listesini de güncelle
        commandTargetSelector.innerHTML = '<option value="*">Tüm Botlar (Running)</option>';

        if (bots.length === 0) {
            botListDiv.innerHTML = '<p>Config dosyasında bot bulunamadı.</p>';
            return;
        }

        bots.forEach(bot => {
            const isRunning = bot.status === 'running';
            const card = document.createElement('div');
            card.className = 'bot-card';
            
            const botConfig = bot.config || bot;
            const botState = (isRunning && bot.stats && bot.stats.state) ? bot.stats.state : '...';
            const statusText = isRunning ? `Running (${botState})` : 'Stopped';

            let statsHtml = '<p class="stats-pos">Durum: Not spawned</p>';
            if (isRunning && bot.stats && bot.stats.health != null) {
                const pos = bot.stats.pos ? `X: ${Math.floor(bot.stats.pos.x)}, Y: ${Math.floor(bot.stats.pos.y)}, Z: ${Math.floor(bot.stats.pos.z)}` : 'N/A';
                statsHtml = `
                    <p class="stats">HP: ❤️ ${bot.stats.health.toFixed(0)} | Food: 🍗 ${bot.stats.food.toFixed(0)}</p>
                    <p class="stats-pos">Pozisyon: ${pos}</p>
                `;
            } else if (isRunning) {
                statsHtml = `<p class="stats-pos">Durum: Spawning... (${botState})</p>`;
            }

            // DİKKAT: 'commandBarHtml' buradan KALDIRILDI. (Kötü komut kutusu)

            card.innerHTML = `
                <div class="bot-card-info">
                    <h3>${bot.name}</h3>
                    <p>
                        Status: <strong class="status-${isRunning ? 'running' : 'stopped'}">
                            ${statusText}
                        </strong>
                    </p>
                    <p>Behavior: ${botConfig.behavior}</p>
                    ${statsHtml} 
                </div>
                <div class="bot-card-actions">
                    <button class="btn-start" ${isRunning ? 'disabled' : ''} data-botname="${bot.name}">Start</button>
                    <button class="btn-stop" ${!isRunning ? 'disabled' : ''} data-botname="${bot.name}">Stop</button>
                    <button class="btn-edit" data-botname="${bot.name}" title="Düzenle">&#9998;</button>
                    <button class="btn-delete" ${isRunning ? 'disabled' : ''} data-botname="${bot.name}" title="Sil">&#128465;</button>
                </div>
                `;
            botListDiv.appendChild(card);

            // YENİ: Eğer bot çalışıyorsa, genel konsolun hedef listesine ekle
            if (isRunning) {
                const option = document.createElement('option');
                option.value = bot.name;
                option.innerText = bot.name;
                commandTargetSelector.appendChild(option);
            }
        });

        // Tüm butonlara olayları ekle
        addEventListeners();
    }

    // =====================================================================
    // --- Form ve Buton Mantığı ---
    // =====================================================================

    function addEventListeners() {
        // Start
        document.querySelectorAll('.btn-start').forEach(button => {
            button.addEventListener('click', (e) => {
                socket.emit('command_start', e.target.dataset.botname);
                e.target.disabled = true; 
            });
        });

        // Stop
        document.querySelectorAll('.btn-stop').forEach(button => {
            button.addEventListener('click', (e) => {
                socket.emit('command_stop', e.target.dataset.botname);
                e.target.disabled = true; 
            });
        });

        // Delete Bot
        document.querySelectorAll('.btn-delete').forEach(button => {
            button.addEventListener('click', (e) => {
                const botName = e.target.dataset.botname;
                if (confirm(`'${botName}' botunu kalıcı olarak silmek istediğinizden emin misiniz?`)) {
                    socket.emit('config_delete_bot', botName);
                }
            });
        });
        
        // Edit Bot (Formu Doldurmak için config'i iste)
        document.querySelectorAll('.btn-edit').forEach(button => {
            button.addEventListener('click', (e) => {
                const botName = e.target.dataset.botname;
                 socket.emit('config_get_bot', botName); // Bu, 'config_show_bot'u tetikleyecek
            });
        });
    }

    // --- YENİ: Modal (Popup) Kontrolleri ---
    showModalButton.addEventListener('click', () => {
        clearForm(); // Yeni bot eklerken formun boş olduğundan emin ol
        modalOverlay.style.display = 'block';
    });
    closeModalButton.addEventListener('click', () => {
        modalOverlay.style.display = 'none';
    });
    // Dışarı tıklayınca kapat
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    });

    // --- YENİ: Genel Komut Konsolu ---
    globalSendButton.addEventListener('click', () => {
        const target = commandTargetSelector.value;
        const fullCommand = globalCommandInput.value;
        
        if (fullCommand) {
            socket.emit('command_send_global', { target, fullCommand });
            globalCommandInput.value = ''; // Girişi temizle
        }
    });

    // --- Form Yönetimi (Güncellendi) ---
    botForm.addEventListener('submit', (e) => {
        e.preventDefault(); 
        
        const botData = {
            name: document.getElementById('bot-name').value,
            username: document.getElementById('bot-username').value,
            host: document.getElementById('bot-host').value,
            port: parseInt(document.getElementById('bot-port').value),
            version: document.getElementById('bot-version').value,
            auth: document.getElementById('bot-auth').value,
            behavior: document.getElementById('bot-behavior').value,
            autoReconnect: document.getElementById('bot-autoReconnect').checked,
            reconnectDelay: 30, 
            params: {}, 
            automation: { autoEat: false, foodToEat: [] },
            proxy: {
                host: document.getElementById('proxy-host').value || null,
                port: parseInt(document.getElementById('proxy-port').value) || null,
            }
        };
        
        if (!botData.proxy.host || !botData.proxy.port) {
            botData.proxy = null; // Proxy bilgisi eksikse objeyi null yap
        }

        socket.emit('config_add_bot', botData);
        modalOverlay.style.display = 'none'; // Formu kaydettikten sonra modal'ı kapat
        clearForm();
    });

    clearButton.addEventListener('click', clearForm);

    function clearForm() {
        botForm.reset();
        document.getElementById('bot-name').value = ''; 
    }
    
    // Formu, controller'dan gelen veriyle doldurur (Edit için)
    function fillForm(botConfig) {
        document.getElementById('bot-name').value = botConfig.name || '';
        document.getElementById('bot-username').value = botConfig.username || '';
        document.getElementById('bot-host').value = botConfig.host || '';
        document.getElementById('bot-port').value = botConfig.port || 25565;
        document.getElementById('bot-version').value = botConfig.version || '1.20.1';
        document.getElementById('bot-auth').value = botConfig.auth || 'offline';
        document.getElementById('bot-behavior').value = botConfig.behavior || 'idle';
        document.getElementById('bot-autoReconnect').checked = botConfig.autoReconnect !== false;
        
        document.getElementById('proxy-host').value = botConfig.proxy ? botConfig.proxy.host : '';
        document.getElementById('proxy-port').value = botConfig.proxy ? botConfig.proxy.port : '';
    }
});