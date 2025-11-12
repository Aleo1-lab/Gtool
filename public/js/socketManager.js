// public/js/socketManager.js

export class SocketManager {
    constructor(socket, state) {
        this.socket = socket;
        this.state = state;
        this.initSocketListeners();
        this.initActionListeners();
    }

    // GÜNCELLENDİ: Düzeltme #5 - Hata Sınırları (Error Boundaries)
    initSocketListeners() {
        this.socket.on('full_state', (bots) => {
            try {
                this.state.setFullState(bots);
            } catch (e) { console.error("Error in 'full_state' handler:", e); }
        });

        this.socket.on('bot_delta', (delta) => {
            try {
                this.state.applyDelta(delta);
            } catch (e) { console.error("Error in 'bot_delta' handler:", e); }
        });

        this.socket.on('bot_added', (botState) => {
            try {
                this.state.addBot(botState);
            } catch (e) { console.error("Error in 'bot_added' handler:", e); }
        });
        
        this.socket.on('bot_removed', (botData) => {
            try {
                this.state.removeBot(botData.name);
            } catch (e) { console.error("Error in 'bot_removed' handler:", e); }
        });

        this.socket.on('log', (logData) => {
            try {
                this.state.log(logData);
            } catch (e) { console.error("Error in 'log' handler:", e); }
        });

        this.socket.on('config_show_bot', (botConfig) => {
            try {
                this.state.showConfigForm(botConfig);
            } catch (e) { console.error("Error in 'config_show_bot' handler:", e); }
        });
    }

    // GÜNCELLENDİ: Düzeltme #5 - Hata Sınırları (Error Boundaries)
    initActionListeners() {
        this.state.on('action:submitForm', (botData) => {
            try {
                this.socket.emit('config_add_bot', botData);
            } catch (e) { console.error("Error in 'action:submitForm' emitter:", e); }
        });
        
        this.state.on('action:botCommand', ({ action, botName }) => {
            try {
                switch (action) {
                    case 'start': this.socket.emit('command_start', botName); break;
                    case 'stop': this.socket.emit('command_stop', botName); break;
                    case 'delete':
                        if (confirm(`'${botName}' botunu kalıcı olarak silmek istediğinizden emin misiniz?`)) {
                            this.socket.emit('config_delete_bot', botName);
                        }
                        break;
                }
            } catch (e) { console.error("Error in 'action:botCommand' emitter:", e); }
        });
        
        this.state.on('action:globalCommand', ({ target, fullCommand }) => {
            try {
                this.socket.emit('command_send_global', { target, fullCommand });
            } catch (e) { console.error("Error in 'action:globalCommand' emitter:", e); }
        });
        
        this.state.on('action:getConfig', (botName) => {
            try {
                this.socket.emit('config_get_bot', botName);
            } catch (e) { console.error("Error in 'action:getConfig' emitter:", e); }
        });
    }
}