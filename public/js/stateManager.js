// public/js/stateManager.js

/**
 * v4.1 - Merkezi ve reaktif state yönetim sistemi (Pub/Sub)
 */
class StateManager {
    constructor() {
        this.events = {}; 
        this.botStore = new Map();
        this.focusedBot = null;
    }

    // --- Pub/Sub Metotları ---
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    // GÜNCELLENDİ: Düzeltme #5 - Hata Sınırı (Error Boundary) eklendi
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Error in state listener for '${event}':`, e);
                    // Bir listener'ın hatası diğerlerini durdurmaz
                }
            });
        }
    }

    // --- State Değiştirme Metotları (Mutators) ---

    setFullState(bots) {
        this.botStore.clear();
        bots.forEach(bot => {
            this.botStore.set(bot.name, bot);
        });
        this.emit('state:fullState', Array.from(this.botStore.values()));
    }

    applyDelta(delta) {
        const bot = this.botStore.get(delta.name);
        if (!bot) return;

        if (delta.changed.status !== undefined) {
            bot.status = delta.changed.status;
        }
        if (delta.changed.config !== undefined) {
            bot.config = delta.changed.config;
        }
        if (delta.changed.stats !== undefined) {
            bot.stats = { ...bot.stats, ...delta.changed.stats };
        }
        
        this.emit('state:botDelta', { bot, changed: delta.changed });
    }

    addBot(bot) {
        if (this.botStore.has(bot.name)) return;
        this.botStore.set(bot.name, bot);
        this.emit('state:botAdded', bot);
    }

    removeBot(botName) {
        if (!this.botStore.has(botName)) return;
        
        // Düzeltme #6 (Teyit): Silmeden önce 'focused' ise state'i güncelle
        if (this.focusedBot === botName) {
            this.setFocusedBot(null);
        }
        
        this.botStore.delete(botName);
        this.emit('state:botRemoved', botName);
    }
    
    // GÜNCELLENDİ: Düzeltme #2 - Odak değiştirme mantığı
    setFocusedBot(botName) {
        // Eğer 'null' gönderildiyse (Reset butonu) veya
        // mevcut odaklanmış bota tekrar tıklandıysa, odağı kaldır.
        if (botName === null || this.focusedBot === botName) {
            botName = null; // Toggle veya reset
        }
        
        // State zaten aynıysa bir şey yapma
        if (this.focusedBot === botName) return; 
        
        const oldFocus = this.focusedBot;
        this.focusedBot = botName;
        
        this.emit('state:focusedBotChanged', { newFocus: botName, oldFocus: oldFocus });
    }
    
    // --- UI -> Socket için Eylemler ---
    
    submitBotForm(botData) {
        this.emit('action:submitForm', botData);
    }
    
    requestBotAction(action, botName) {
        this.emit('action:botCommand', { action, botName });
    }
    
    sendGlobalCommand(target, fullCommand) {
        this.emit('action:globalCommand', { target, fullCommand });
    }
    
    // GÜNCELLENDİ: Düzeltme #2 - 'requestLogFocus' 'setFocusedBot' oldu
    // UI (Kart tıklaması) bu fonksiyonu çağırır
    requestLogFocus(botName) {
        this.setFocusedBot(botName);
    }

    requestConfigForEdit(botName) {
        this.emit('action:getConfig', botName);
    }
    
    showConfigForm(botConfig) {
        this.emit('state:showConfigForm', botConfig);
    }
    
    log(logData) {
        this.emit('state:log', logData);
    }
}

export const state = new StateManager();