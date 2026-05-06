(function() {
    const logContainer = document.createElement('div');
    logContainer.style.position = 'fixed';
    logContainer.style.bottom = '10px';
    logContainer.style.right = '10px';
    logContainer.style.width = '300px';
    logContainer.style.maxHeight = '200px';
    logContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    logContainer.style.color = '#0f0';
    logContainer.style.fontFamily = 'monospace';
    logContainer.style.fontSize = '10px';
    logContainer.style.padding = '10px';
    logContainer.style.overflowY = 'auto';
    logContainer.style.zIndex = '10000';
    logContainer.style.pointerEvents = 'none';
    logContainer.style.border = '1px solid #0f0';
    logContainer.style.display = 'none';
    logContainer.id = 'debug-log-container';
    document.body.appendChild(logContainer);

    function addLog(msg, type = 'info') {
        const entry = document.createElement('div');
        entry.style.color = type === 'error' ? '#f00' : (type === 'warn' ? '#ff0' : '#0f0');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
        console.log(`[DEBUG] ${msg}`);
    }

    window.onerror = function(msg, url, line) {
        addLog(`ERR: ${msg} (${line})`, 'error');
    };

    window.onunhandledrejection = function(event) {
        addLog(`REJ: ${event.reason}`, 'error');
    };

    // Export to window for manual logging
    window.debugLog = addLog;
    addLog('Debug logger initialized');
})();
