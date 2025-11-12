// public/js/app.js
import { state } from './stateManager.js';
import { SocketManager } from './socketManager.js';
import { UIManager } from './uiManager.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Socket bağlantısını başlat
    const socket = io();
    
    // 2. Yöneticileri başlat
    const socketManager = new SocketManager(socket, state);
    const uiManager = new UIManager(state); 
    
    // 3. Ana Olay Dinleyicilerini Başlat
    initEventListeners(socket, state, uiManager);
    
    console.log("GTool v4.1 (Prod-Ready) Başlatıldı.");
});

/**
 * v4.1 - Sadece Kullanıcı Etkileşimlerini (DOM -> State) dinler.
 */
function initEventListeners(socket, state, uiManager) {
    
    // --- Bot Listesi Olay Yetkilendirmesi (Delegation) ---
    uiManager.elements.botListDiv.addEventListener('click', (e) => {
        const target = e.target;
        const actionButton = target.closest('button[data-action]');
        const card = target.closest('.bot-card');
        
        if (!card) return;
        const botName = card.dataset.botname;

        if (actionButton) {
            e.stopPropagation(); 
            const action = actionButton.dataset.action;
            
            if (action === 'inventory') {
                uiManager.elements.inventoryModal.title.innerText = `${botName} Envanteri`;
                uiManager.elements.inventoryModal.overlay.style.display = 'block';
            } else if (action === 'edit') {
                state.requestConfigForEdit(botName);
            } else {
                state.requestBotAction(action, botName);
            }
        } else {
            state.requestLogFocus(botName);
        }
    });
    
    // --- Global Komut Konsolu Dinleyicisi ---
    uiManager.elements.commandConsole.sendButton.addEventListener('click', () => {
        const target = uiManager.elements.commandConsole.targetSelector.value;
        const fullCommand = uiManager.elements.commandConsole.input.value;
        if (fullCommand) {
            state.sendGlobalCommand(target, fullCommand);
            uiManager.elements.commandConsole.input.value = '';
        }
    });

    // --- Bot Ekleme Formu Dinleyicisi ---
    uiManager.elements.botForm.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = uiManager.elements.botForm;
        const botData = {
            name: f.name.value,
            username: f.username.value,
            host: f.host.value,
            port: parseInt(f.port.value),
            version: f.version.value,
            auth: f.auth.value,
            behavior: f.behavior.value,
            autoReconnect: f.autoReconnect.checked,
            reconnectDelay: 30, params: {},
            automation: { autoEat: false, foodToEat: [] },
            proxy: {
                host: f.proxyHost.value || null,
                port: parseInt(f.proxyPort.value) || null,
            }
        };
        if (!botData.proxy.host || !botData.proxy.port) botData.proxy = null;
        
        state.submitBotForm(botData);
        uiManager.elements.addBotModal.overlay.style.display = 'none';
        uiManager.elements.botForm.form.reset();
    });
    
    // --- Modal Kapatma Düğümleri ---
    uiManager.initModalToggles(uiManager.elements.addBotModal, uiManager.elements.botForm.clearButton, uiManager.elements.botForm.form);
    uiManager.initModalToggles(uiManager.elements.inventoryModal, null, null);
    
    // GÜNCELLENDİ: Düzeltme #2 - Statik "Tümünü Göster" butonunu dinle
    uiManager.elements.showAllLogsButton.addEventListener('click', () => {
        state.setFocusedBot(null); // State'i güncelle
    });
    
    // GÜNCELLENDİ: Düzeltme #3 - 'bot-removed' event'ini dinle
    // (Bu, 'socketManager.js'den 'stateManager.js'e taşındı,
    //  'removeBot' fonksiyonu artık 'setFocusedBot(null)'ı tetikliyor.
    //  Bu yüzden 'app.js'de EKSTRA bir dinleyiciye gerek YOK.)
}