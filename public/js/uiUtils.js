// public/js/uiUtils.js

/**
 * Logları, odaklanmış bot adına göre filtreler (gösterir/gizler).
 * @param {string | null} focusedBotName - Odaklanılan botun adı veya tümünü göstermek için null.
 * @param {HTMLElement} logsPreElement - Logları içeren <pre> elementi.
 */
export function filterLogs(focusedBotName, logsPreElement) {
    const allLogs = logsPreElement.querySelectorAll('span');
    let hasVisibleLogs = false;
    allLogs.forEach(log => {
        if (!focusedBotName) {
            log.style.display = 'block';
            hasVisibleLogs = true;
        } else {
            const isVisible = log.dataset.prefix === focusedBotName;
            log.style.display = isVisible ? 'block' : 'none';
            if (isVisible) hasVisibleLogs = true;
        }
    });
    if (hasVisibleLogs) {
        logsPreElement.parentElement.scrollTop = logsPreElement.parentElement.scrollHeight;
    }
}