// public/js/uiManager.js (v6.0.1 - Hata Düzeltmesi)
import { filterLogs } from './uiUtils.js'; 

export class UIManager {
    constructor(state) {
        this.state = state;
        this.botElementCache = new Map();
        
        this.cacheDOMElements(); 
        this.initDOMListeners(); 
        this.initStateListeners(); 
    }
    
    cacheDOMElements() {
         this.elements = {
            botListDiv: document.getElementById('bot-list'),
            logsPre: document.getElementById('logs'),
            logContainer: document.getElementById('log-container'),
            addBotModal: {
                overlay: document.getElementById('modal-overlay'),
                closeButton: document.getElementById('modal-close-button'),
                showButton: document.getElementById('show-add-bot-modal') 
            },
            inventoryModal: {
                overlay: document.getElementById('inventory-modal-overlay'),
                closeButton: document.getElementById('inventory-modal-close-button'),
                title: document.getElementById('inventory-modal-title'),
                grid: document.getElementById('inventory-grid-container')
            },
            taskModal: {
                overlay: document.getElementById('task-modal-overlay'),
                closeButton: document.getElementById('task-modal-close-button'),
                title: document.getElementById('task-modal-title'),
                list: document.getElementById('task-queue-list'),
                form: document.getElementById('add-task-form'),
                botNameInput: document.getElementById('task-bot-name'),
                scriptSelect: document.getElementById('task-script-name'),
                paramsJson: document.getElementById('task-params-json')
            },
            taskLogModal: {
                overlay: document.getElementById('task-log-modal-overlay'),
                closeButton: document.getElementById('task-log-modal-close-button'),
                title: document.getElementById('task-log-modal-title'),
                output: document.getElementById('task-log-output')
            },
            botForm: {
                form: document.getElementById('add-bot-form'),
                clearButton: document.getElementById('clear-form-button'),
                name: document.getElementById('bot-name'),
                username: document.getElementById('bot-username'),
                host: document.getElementById('bot-host'),
                port: document.getElementById('bot-port'),
                version: document.getElementById('bot-version'),
                auth: document.getElementById('bot-auth'),
                behavior: document.getElementById('bot-behavior'), 
                autoReconnect: document.getElementById('bot-autoReconnect'),
                paramsJson: document.getElementById('bot-params-json'), 
                proxyHost: document.getElementById('proxy-host'),
                proxyPort: document.getElementById('proxy-port')
            },
            commandConsole: {
                targetSelector: document.getElementById('command-target-selector'),
                input: document.getElementById('global-command-input'),
                sendButton: document.getElementById('global-send-button')
            },
            showAllLogsButton: document.getElementById('btn-show-all-logs')
        };
    }

    initStateListeners() {
        this.state.on('state:fullState', (bots) => {
            try {
                this.elements.botListDiv.innerHTML = ''; 
                this.botElementCache.clear();
                bots.forEach(bot => this.addBotCard(bot));
                this.updateCommandTargetSelector();
            } catch (e) { console.error("Error in 'state:fullState' UI handler:", e); }
        });

        this.state.on('state:botDelta', ({ bot, changed }) => {
            try {
                const botCard = this.botElementCache.get(bot.name);
                if (botCard) this.updateBotCardPartial(botCard, changed);
            } catch (e) { console.error("Error in 'state:botDelta' UI handler:", e, changed); }
        });

        this.state.on('state:botAdded', (bot) => {
            try {
                if (this.botElementCache.has(bot.name)) return;
                this.addBotCard(bot);
                this.updateCommandTargetSelector(); 
            } catch (e) { console.error("Error in 'state:botAdded' UI handler:", e); }
        });

        this.state.on('state:botRemoved', (botName) => {
            try {
                if (this.botElementCache.has(botName)) {
                    this.botElementCache.get(botName).remove();
                    this.botElementCache.delete(botName); 
                    this.updateCommandTargetSelector();
                }
            } catch (e) { console.error("Error in 'state:botRemoved' UI handler:", e); }
        });
        
        this.state.on('state:log', (logData) => {
            try {
                this.renderLog(logData);
            } catch (e) { console.error("Error in 'state:log' UI handler:", e); }
        });
        
        this.state.on('state:showConfigForm', (botConfig) => {
            try {
                this.fillForm(botConfig);
                this.elements.addBotModal.overlay.style.display = 'block';
            } catch (e) { console.error("Error in 'state:showConfigForm' UI handler:", e); }
        });

        this.state.on('state:focusedBotChanged', ({ newFocus, oldFocus }) => {
            try {
                if (oldFocus && this.botElementCache.has(oldFocus)) {
                    this.botElementCache.get(oldFocus).classList.remove('selected');
                }
                if (newFocus && this.botElementCache.has(newFocus)) {
                    this.botElementCache.get(newFocus).classList.add('selected');
                }
                this.elements.showAllLogsButton.style.display = newFocus ? 'inline-block' : 'none';
                filterLogs(newFocus, this.elements.logsPre);
            } catch (e) { console.error("Error in 'state:focusedBotChanged' UI handler:", e); }
        });
        
        this.state.on('state:scriptsLoaded', () => {
            try {
                const behaviorSelect = this.elements.botForm.behavior;
                behaviorSelect.innerHTML = ''; 
                this.state.availableBehaviors.forEach(scriptName => {
                    const option = document.createElement('option');
                    option.value = scriptName;
                    option.textContent = scriptName;
                    behaviorSelect.appendChild(option);
                });
                
                const taskSelect = this.elements.taskModal.scriptSelect;
                taskSelect.innerHTML = '<option value="">Script Seçin...</option>'; 
                this.state.availableTaskScripts.forEach(scriptName => {
                    const option = document.createElement('option');
                    option.value = scriptName;
                    option.textContent = scriptName;
                    taskSelect.appendChild(option);
                });
            } catch(e) { console.error("Error in 'state:scriptsLoaded' UI handler:", e); }
        });

        this.state.on('state:showTaskModal', (bot) => {
            try {
                this.elements.taskModal.title.textContent = `Görev Yöneticisi: ${bot.name}`;
                this.elements.taskModal.botNameInput.value = bot.name;
                this.renderTaskQueue(bot.name, bot.taskQueue || []);
                this.elements.taskModal.overlay.style.display = 'block';
            } catch(e) { console.error("Error in 'state:showTaskModal' UI handler:", e); }
        });
        
        this.state.on('state:showTaskLogModal', ({ botName, task }) => {
            try {
                this.elements.taskLogModal.title.textContent = `Canlı Log: ${botName} - ${task.scriptName.split('.')[0]}`;
                this.elements.taskLogModal.output.innerHTML = ''; 
                this.elements.taskLogModal.overlay.style.display = 'block';
            } catch(e) { console.error("Error in 'state:showTaskLogModal' UI handler:", e); }
        });

        this.state.on('state:taskLogStream', (message) => {
            try {
                const logEl = this.elements.taskLogModal.output;
                logEl.textContent += message + '\n';
                logEl.scrollTop = logEl.scrollHeight; 
            } catch(e) { console.error("Error in 'state:taskLogStream' UI handler:", e); }
        });
    }
    
    initDOMListeners() {
        try {
            this.elements.botListDiv.addEventListener('click', (e) => {
                const target = e.target;
                const actionButton = target.closest('button[data-action]');
                const card = target.closest('.bot-card');
                if (!card) return;
                const botName = card.dataset.botname;

                if (actionButton) {
                    e.stopPropagation(); 
                    const action = actionButton.dataset.action;
                    
                    if (action === 'inventory') {
                        this.elements.inventoryModal.title.textContent = `${botName} Envanteri`;
                        const botState = this.state.botStore.get(botName);
                        this.renderInventory(botState.stats.inventory || []);
                        this.elements.inventoryModal.overlay.style.display = 'block';
                    
                    } else if (action === 'edit') {
                        this.state.requestConfigForEdit(botName);
                    
                    } else if (action === 'tasks') {
                        this.state.requestTaskModal(botName);
                    
                    } else {
                        this.state.requestBotAction(action, botName);
                    }
                } else {
                    this.state.requestLogFocus(botName);
                }
            });
            
            this.elements.commandConsole.sendButton.addEventListener('click', () => {
                const target = this.elements.commandConsole.targetSelector.value;
                const fullCommand = this.elements.commandConsole.input.value;
                if (fullCommand) {
                    this.state.sendGlobalCommand(target, fullCommand);
                    this.elements.commandConsole.input.value = '';
                }
            });

            this.elements.botForm.form.addEventListener('submit', (e) => {
                e.preventDefault();
                const f = this.elements.botForm;
                let params = {};
                try {
                    if (f.paramsJson.value.trim()) params = JSON.parse(f.paramsJson.value);
                } catch (err) {
                    alert(`HATA: Params (JSON) verisi geçersiz:\n${err.message}`); return;
                }
                const botData = {
                    name: f.name.value, username: f.username.value, host: f.host.value,
                    port: parseInt(f.port.value), version: f.version.value, auth: f.auth.value,
                    behavior: f.behavior.value, autoReconnect: f.autoReconnect.checked,
                    reconnectDelay: 30, params: params, 
                    automation: { autoEat: false, foodToEat: [] },
                    proxy: { host: f.proxyHost.value || null, port: parseInt(f.proxyPort.value) || null }
                };
                if (!botData.proxy.host || !botData.proxy.port) botData.proxy = null;
                
                this.state.submitBotForm(botData);
                this.elements.addBotModal.overlay.style.display = 'none';
                this.elements.botForm.form.reset();
            });
            
            this.elements.taskModal.form.addEventListener('submit', (e) => {
                e.preventDefault();
                const f = this.elements.taskModal;
                let params = {};
                try {
                    if (f.paramsJson.value.trim()) params = JSON.parse(f.paramsJson.value);
                } catch (err) {
                    alert(`HATA: Görev Parametreleri (JSON) geçersiz:\n${err.message}`); return;
                }
                
                const taskData = {
                    botName: f.botNameInput.value,
                    scriptName: f.scriptSelect.value,
                    params: params
                };

                if (!taskData.botName || !taskData.scriptName) {
                    alert('Bot adı veya script adı eksik.'); return;
                }
                
                this.state.requestAddTask(taskData);
                f.form.reset(); 
                f.scriptSelect.value = ""; 
            });

            this.initModalToggles(this.elements.addBotModal, this.elements.botForm.clearButton, this.elements.botForm.form);
            this.initModalToggles(this.elements.inventoryModal, null, null);
            this.initModalToggles(this.elements.taskModal, null, this.elements.taskModal.form);
            
            this.initModalToggles(this.elements.taskLogModal, null, null, () => {
                this.state.requestStopTaskLogView(); 
            });
            
            this.elements.showAllLogsButton.addEventListener('click', () => {
                this.state.setFocusedBot(null); 
            });
            
        } catch (e) {
            console.error("CRITICAL: Failed to initialize DOM listeners:", e);
        }
    }
    
    // =====================================================================
    // --- DOM Render Fonksiyonları (v6.0 - GÜNCELLENDİ) ---
    // =====================================================================
    
    addBotCard(bot) {
        const botCard = this.createBotCard(bot.name, bot.config, bot.status, bot.stats, bot.taskQueue);
        this.elements.botListDiv.appendChild(botCard);
        this.botElementCache.set(bot.name, botCard);
    }

    updateBotCardPartial(cardElement, changed) {
        if (changed.status !== undefined) {
            this.updateStatus(cardElement, changed.status);
        }
        if (changed.config !== undefined) {
            this.updateConfig(cardElement, changed.config);
        }
        if (changed.stats !== undefined) {
            this.updateStats(cardElement, changed.stats);
        }
        if (changed.taskQueue !== undefined) {
            this.renderTaskQueue(cardElement.dataset.botname, changed.taskQueue, cardElement);
        }
    }

    updateStatus(cardElement, newStatus) {
        const isRunning = newStatus === 'running';
        cardElement.dataset.status = newStatus; 
        const statusElement = cardElement.querySelector('.bot-status-text');
        const statusClass = `status-${isRunning ? 'running' : 'stopped'}`;
        
        if (statusElement.dataset.statusClass !== statusClass) {
            statusElement.className = `bot-status-text ${statusClass}`;
            statusElement.dataset.statusClass = statusClass;
        }
        
        const botState = cardElement.querySelector('.bot-state-text')?.textContent || '...';
        
        statusElement.innerHTML = ''; 
        const statusTextNode = document.createTextNode(isRunning ? 'Running (' : 'Stopped');
        statusElement.appendChild(statusTextNode);
        if (isRunning) {
            const stateSpan = document.createElement('span');
            stateSpan.className = 'bot-state-text';
            stateSpan.textContent = botState; 
            statusElement.appendChild(stateSpan);
            statusElement.appendChild(document.createTextNode(')'));
        }
        
        cardElement.querySelector('[data-action="start"]').disabled = isRunning;
        cardElement.querySelector('[data-action="stop"]').disabled = !isRunning;
        cardElement.querySelector('[data-action="delete"]').disabled = isRunning;
        cardElement.querySelector('[data-action="inventory"]').disabled = !isRunning;
        cardElement.querySelector('[data-action="tasks"]').disabled = false; 
        
        this.updateCommandTargetSelector();
    }

    updateConfig(cardElement, newConfig) {
        const behaviorElement = cardElement.querySelector('.bot-behavior-text');
        if (behaviorElement) behaviorElement.textContent = newConfig.behavior || 'idle'; 
    }

    updateStats(cardElement, deltaStats) {
        const statsDynamicElement = cardElement.querySelector('.bot-stats-dynamic');
        const isRunning = cardElement.dataset.status === 'running';

        if (deltaStats.state !== undefined) {
            let stateTextElement = cardElement.querySelector('.bot-state-text');
            if (!stateTextElement && isRunning) {
                 this.updateStatus(cardElement, 'running'); 
                stateTextElement = cardElement.querySelector('.bot-state-text');
            }
            if (stateTextElement) stateTextElement.textContent = deltaStats.state; 
            let statsPosElement = statsDynamicElement.querySelector('.stats-pos');
            if (statsPosElement && statsPosElement.textContent.includes('Spawning')) { 
                 statsPosElement.textContent = `Durum: Spawning... (${deltaStats.state})`;
            }
        }
        if (deltaStats.health !== undefined || deltaStats.food !== undefined) {
            let statsElement = statsDynamicElement.querySelector('.stats');
            if (!statsElement) {
                statsElement = document.createElement('p'); statsElement.className = 'stats';
                statsDynamicElement.prepend(statsElement); 
            }
            const health = deltaStats.health ?? parseFloat(cardElement.dataset.currentHealth) ?? '?';
            const food = deltaStats.food ?? parseFloat(cardElement.dataset.currentFood) ?? '?';
            statsElement.textContent = `HP: ❤️ ${health.toFixed(0)} | Food: 🍗 ${food.toFixed(0)}`;
            cardElement.dataset.currentHealth = health;
            cardElement.dataset.currentFood = food;
        }
        if (deltaStats.pos !== undefined) {
            let posElement = statsDynamicElement.querySelector('.stats-pos');
            if (!posElement || posElement.textContent.includes('Spawning')) {
                if (!posElement) {
                    posElement = document.createElement('p'); posElement.className = 'stats-pos';
                    const statsEl = statsDynamicElement.querySelector('.stats');
                    if (statsEl) statsEl.after(posElement);
                    else statsDynamicElement.appendChild(posElement);
                }
            }
            const pos = deltaStats.pos;
            posElement.textContent = `Pozisyon: X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}`;
        }
        if (deltaStats.nearbyEntities !== undefined) {
            this.renderRadar(statsDynamicElement, deltaStats.nearbyEntities);
        }
        if (deltaStats.inventory !== undefined) {
            const botState = this.state.botStore.get(cardElement.dataset.botname);
            if(botState) botState.stats.inventory = deltaStats.inventory;
            if (this.elements.inventoryModal.overlay.style.display === 'block' && 
                this.elements.inventoryModal.title.textContent.includes(cardElement.dataset.botname)) {
                this.renderInventory(deltaStats.inventory);
            }
        }
    }

    createBotCard(botName, config, status, stats, taskQueue) {
        const card = document.createElement('div');
        card.className = 'bot-card';
        card.dataset.botname = botName;
        card.dataset.status = status; 
        card.dataset.currentHealth = stats?.health || '?';
        card.dataset.currentFood = stats?.food || '?';

        const isRunning = status === 'running';
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'bot-card-info';
        
        const h3 = document.createElement('h3');
        h3.textContent = config.name; 
        infoDiv.appendChild(h3);
        
        const statusP = document.createElement('p');
        const statusStrong = document.createElement('strong');
        statusStrong.className = `bot-status-text status-${isRunning ? 'running' : 'stopped'}`;
        statusStrong.dataset.statusClass = `status-${isRunning ? 'running' : 'stopped'}`;
        const botState = (isRunning && stats && stats.state) ? stats.state : '...';
        const statusTextNode = document.createTextNode(isRunning ? 'Running (' : 'Stopped');
        statusStrong.appendChild(statusTextNode);
        if (isRunning) {
            const stateSpan = document.createElement('span');
            stateSpan.className = 'bot-state-text';
            stateSpan.textContent = botState; 
            statusStrong.appendChild(stateSpan);
            statusStrong.appendChild(document.createTextNode(')'));
        }
        statusP.appendChild(document.createTextNode('Status: '));
        statusP.appendChild(statusStrong);
        infoDiv.appendChild(statusP);
        const behaviorP = document.createElement('p');
        behaviorP.textContent = 'Behavior: '; 
        const behaviorSpan = document.createElement('span');
        behaviorSpan.className = 'bot-behavior-text';
        behaviorSpan.textContent = config.behavior || 'idle'; 
        behaviorP.appendChild(behaviorSpan);
        infoDiv.appendChild(behaviorP);
        
        const statsDiv = document.createElement('div');
        statsDiv.className = 'bot-stats-dynamic';
        statsDiv.innerHTML = this.renderStatsHtml(isRunning, stats);
        infoDiv.appendChild(statsDiv);
        
        const taskQueueDiv = document.createElement('div');
        taskQueueDiv.className = 'bot-task-queue';
        infoDiv.appendChild(taskQueueDiv);
        
        // --- HATA DÜZELTMESİ BURADA ---
        // `infoDiv`'i `card`'a ekledikten SONRA `renderTaskQueue`'i çağır.
        card.appendChild(infoDiv); // ÖNCE EKLE
        this.renderTaskQueue(botName, taskQueue, card); // SONRA ÇAĞIR
        // --- HATA DÜZELTMESİ BİTTİ ---
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'bot-card-actions';
        actionsDiv.innerHTML = `
            <button class="btn-start" ${isRunning ? 'disabled' : ''} data-action="start">Start</button>
            <button class="btn-stop" ${!isRunning ? 'disabled' : ''} data-action="stop">Stop</button>
            <button class="btn-edit" data-action="edit" title="Düzenle">&#9998;</button>
            <button class="btn-delete" ${isRunning ? 'disabled' : ''} data-action="delete" title="Sil">&#128465;</button>
            <button class="btn-inventory" ${!isRunning ? 'disabled' : ''} data-action="inventory" title="Envanter">📦</button>
            <button class="btn-tasks" data-action="tasks" title="Görevler">📝</button>
        `;
        card.appendChild(actionsDiv);
            
        return card;
    }

    // =====================================================================
    // --- Yardımcı Render Fonksiyonları (v6.0 - GÜNCELLENDİ) ---
    // =====================================================================

    renderStatsHtml(isRunning, stats) {
        let statsHtml = '<p class="stats-pos">Durum: Not spawned</p>'; let radarHtml = '';
        if (isRunning) {
            if (stats && stats.health != null) {
                const pos = stats.pos ? `X: ${Math.floor(stats.pos.x)}, Y: ${Math.floor(stats.pos.y)}, Z: ${Math.floor(stats.pos.z)}` : 'N/A';
                statsHtml = `<p class="stats">HP: ❤️ ${stats.health.toFixed(0)} | Food: 🍗 ${stats.food.toFixed(0)}</p><p class="stats-pos">Pozisyon: ${pos}</p>`;
            } else {
                const stateText = stats?.state || '...';
                statsHtml = `<p class="stats-pos">Durum: Spawning... (<span class="bot-state-text">${stateText}</span>)</p>`;
            }
            radarHtml = this.renderRadar(null, stats?.nearbyEntities || []);
        }
        return statsHtml + radarHtml;
    }
    renderRadar(statsDynamicElement, entities) {
        const fragment = document.createDocumentFragment();
        let radarList, radarTitle; if (!entities) entities = [];
        if (statsDynamicElement) {
            radarTitle = statsDynamicElement.querySelector('.stats-radar-title');
            radarList = statsDynamicElement.querySelector('.radar-list');
            if (!radarTitle) { radarTitle = document.createElement('p'); radarTitle.className = 'stats-radar-title'; statsDynamicElement.appendChild(radarTitle); }
            if (!radarList) { radarList = document.createElement('ul'); radarList.className = 'radar-list'; statsDynamicElement.appendChild(radarList); }
        }
        let titleText = 'Radar: (Etraf Temiz)';
        if (entities.length > 0) {
            titleText = `Radar (En Yakın ${entities.length}):`;
            entities.forEach(e => {
                const li = document.createElement('li');
                const typeClass = e.type === 'Player' ? 'radar-player' : (e.type === 'Mob' ? 'radar-mob' : 'radar-object');
                li.className = typeClass;
                li.textContent = `[${e.type}] ${e.name} (${e.distance}m)`; 
                fragment.appendChild(li); 
            });
        }
        if (statsDynamicElement) {
            radarTitle.textContent = titleText; radarList.innerHTML = ''; radarList.appendChild(fragment); 
        } else {
            const listHtml = Array.from(fragment.childNodes).map(node => node.outerHTML).join('');
            return `<p class="stats-radar-title">${titleText}</p><ul class="radar-list">${listHtml}</ul>`;
        }
    }
    renderInventory(items) {
        const grid = this.elements.inventoryModal.grid; grid.innerHTML = ''; 
        const slotNames = { 5: "helmet", 6: "chest", 7: "legs", 8: "boots", 45: "offhand", 9: "i0", 10: "i1", 11: "i2", 12: "i3", 13: "i4", 14: "i5", 15: "i6", 16: "i7", 17: "i8", 18: "i9", 19: "i10", 20: "i11", 21: "i12", 22: "i13", 23: "i14", 24: "i15", 25: "i16", 26: "i17", 27: "i18", 28: "i19", 29: "i20", 30: "i21", 31: "i22", 32: "i23", 33: "i24", 34: "i25", 35: "i26", 36: "h0", 37: "h1", 38: "h2", 39: "h3", 40: "h4", 41: "h5", 42: "h6", 43: "h7", 44: "h8" };
        const slots = {}; for (let i = 5; i <= 45; i++) slots[i] = null;
        if (items) { items.forEach(item => { if (item && slots.hasOwnProperty(item.slot)) { slots[item.slot] = item; } }); }
        const fragment = document.createDocumentFragment(); 
        for (const slotId in slots) {
            const item = slots[slotId]; const slotDiv = document.createElement('div');
            slotDiv.className = 'inventory-slot'; slotDiv.dataset.slotName = slotNames[slotId]; 
            if (item) {
                slotDiv.textContent = item.displayName; slotDiv.title = `${item.name} (id: ${item.type})`;
                if (item.count > 1) { const countSpan = document.createElement('span'); countSpan.className = 'item-count'; countSpan.textContent = item.count; slotDiv.appendChild(countSpan); }
            }
            fragment.appendChild(slotDiv);
        }
        grid.appendChild(fragment);
    }
    
    renderLog(logData) {
        const logElement = document.createElement('span');
        const time = new Date().toLocaleTimeString();
        logElement.className = `log-${logData.type || 'log'}`;
        logElement.dataset.prefix = logData.prefix;
        logElement.textContent = `[${time}] [${logData.prefix}] ${logData.message}\n`;
        if (this.state.focusedBot && this.state.focusedBot !== logData.prefix) {
            logElement.style.display = 'none';
        }
        this.elements.logsPre.appendChild(logElement);
        if (!this.state.focusedBot || this.state.focusedBot === logData.prefix) {
            this.elements.logsPre.parentElement.scrollTop = this.elements.logsPre.parentElement.scrollHeight;
        }
    }

    updateCommandTargetSelector() {
        const selector = this.elements.commandConsole.targetSelector;
        const currentTarget = selector.value;
        const newBotOptions = ['<option value="*">Tüm Botlar (Running)</option>'];
        let targetStillExists = false;
        
        for (const [botName, cardElement] of this.botElementCache.entries()) {
            if (cardElement.dataset.status === 'running') {
                const selected = (botName === currentTarget) ? ' selected' : '';
                if (selected) targetStillExists = true;
                newBotOptions.push(`<option value="${botName}"${selected}>${botName}</option>`);
            }
        }
        selector.innerHTML = newBotOptions.join('');
        if (!targetStillExists) selector.value = '*';
    }

    initModalToggles(modal, clearButton, formToReset, onCloseCallback = null) {
        if (modal.showButton) {
            modal.showButton.addEventListener('click', () => {
                if (formToReset) {
                    formToReset.reset(); 
                    if (this.elements.botForm.paramsJson) this.elements.botForm.paramsJson.value = ''; 
                    if (this.elements.taskModal.paramsJson) this.elements.taskModal.paramsJson.value = '';
                }
                modal.overlay.style.display = 'block';
            });
        }
        
        const closeModal = () => {
            modal.overlay.style.display = 'none';
            if (onCloseCallback) onCloseCallback(); 
        };
        
        modal.closeButton.addEventListener('click', closeModal);
        modal.overlay.addEventListener('click', (e) => {
            if (e.target === modal.overlay) closeModal();
        });
        
        if (clearButton && formToReset) {
            clearButton.addEventListener('click', () => {
                formToReset.reset();
                if (this.elements.botForm.paramsJson) this.elements.botForm.paramsJson.value = ''; 
                if (this.elements.taskModal.paramsJson) this.elements.taskModal.paramsJson.value = '';
            });
        }
    }

    fillForm(botConfig) {
        const f = this.elements.botForm;
        f.name.value = botConfig.name || '';
        f.username.value = botConfig.username || '';
        f.host.value = botConfig.host || '';
        f.port.value = botConfig.port || 25565;
        f.version.value = botConfig.version || '1.20.1';
        f.auth.value = botConfig.auth || 'offline';
        f.behavior.value = botConfig.behavior || 'idle'; 
        f.autoReconnect.checked = botConfig.autoReconnect !== false;
        f.paramsJson.value = botConfig.params ? JSON.stringify(botConfig.params, null, 2) : '';
        f.proxyHost.value = botConfig.proxy ? botConfig.proxy.host : '';
        f.proxyPort.value = botConfig.proxy ? botConfig.proxy.port : '';
    }
    
    renderTaskQueue(botName, taskQueue, cardElement) {
        
        // 1. Bot Kartı Güncellemesi
        const card = cardElement || this.botElementCache.get(botName);
        if (card) {
            const queueDiv = card.querySelector('.bot-task-queue');
            // Düzeltme: Eğer queueDiv null ise (ki artık olmamalı) hatayı yakala
            if (!queueDiv) {
                console.warn(`renderTaskQueue: Bot kartında '.bot-task-queue' div'i bulunamadı. (${botName})`);
                return; // Fonksiyondan çık
            }
            queueDiv.innerHTML = ''; // Temizle
            if (taskQueue && taskQueue.length > 0) {
                const title = document.createElement('p');
                title.className = 'bot-task-queue-title';
                title.textContent = 'Görev Kuyruğu:';
                
                const list = document.createElement('ul');
                list.className = 'task-queue-list';
                
                taskQueue.slice(0, 2).forEach((task, index) => {
                    const li = document.createElement('li');
                    li.textContent = `(${index + 1}) ${task.scriptName}`;
                    if (index === 0) li.className = 'task-status-running'; 
                    list.appendChild(li);
                });
                
                if (taskQueue.length > 2) {
                    const li = document.createElement('li');
                    li.textContent = `...ve ${taskQueue.length - 2} tane daha.`;
                    list.appendChild(li);
                }
                queueDiv.appendChild(title);
                queueDiv.appendChild(list);
            }
        }
        
        // 2. Modal Güncellemesi (Eğer açıksa)
        if (this.elements.taskModal.overlay.style.display === 'block' &&
            this.elements.taskModal.botNameInput.value === botName) {
                
            const listDiv = this.elements.taskModal.list;
            listDiv.innerHTML = ''; 
            
            if (!taskQueue || taskQueue.length === 0) {
                listDiv.innerHTML = '<p>Kuyruk boş.</p>';
                return;
            }

            taskQueue.forEach((task, index) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'task-queue-item';
                itemDiv.innerHTML = `
                    <div class="task-info">
                        <span class="task-name">(${index + 1}) ${task.scriptName}</span>
                        <span class="task-params">${JSON.stringify(task.params)}</span>
                    </div>
                    <div class="task-actions">
                        <button class="btn-view-log" data-task-id="${task.id}" data-task-index="${index}">Log</button>
                        <button class="btn-remove-task" data-task-id="${task.id}" title="Sil">X</button>
                    </div>
                `;
                
                itemDiv.querySelector('.btn-view-log').addEventListener('click', () => {
                    this.state.requestTaskLogView(botName, task);
                });
                itemDiv.querySelector('.btn-remove-task').addEventListener('click', () => {
                    alert('Görev silme henüz eklenmedi. (TODO: state.emit(action:removeTask))');
                    // TODO: this.state.requestRemoveTask(botName, task.id);
                });
                
                listDiv.appendChild(itemDiv);
            });
        }
    }
}