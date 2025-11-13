// public/js/app.js (v6.0)
import { state } from './stateManager.js';
import { SocketManager } from './socketManager.js';
import { UIManager } from './uiManager.js';
// uiUtils.js'ye gerek yok, o uiManager içinde import ediliyor.

document.addEventListener('DOMContentLoaded', () => {
    // 1. Socket bağlantısını başlat
    const socket = io();
    
    // 2. Yöneticileri başlat
    // SocketManager, socket olaylarını dinler ve state'i günceller.
    const socketManager = new SocketManager(socket, state);
    
    // UIManager, state olaylarını dinler ve DOM'u (HTML) günceller.
    // DOM event listener'ları (tıklamalar vb.) kendi constructor'ında başlatır.
    const uiManager = new UIManager(state); 
    
    console.log("GTool v6.0 (Task System) Başlatıldı.");
});