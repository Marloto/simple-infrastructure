

/**
 * Zeigt eine Benachrichtigung am oberen Bildschirmrand an
 * @param {string} message - Die anzuzeigende Nachricht
 * @param {string} type - Der Bootstrap-Typ (success, danger, warning, info)
 */
export function showNotification(message, type = 'info') {
    // Prüfe, ob ein Benachrichtigungscontainer existiert
    let notificationContainer = document.getElementById('notification-container');
    
    if (!notificationContainer) {
        // Erstelle einen neuen Container, wenn keiner existiert
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.top = '10px';
        notificationContainer.style.left = '50%';
        notificationContainer.style.transform = 'translateX(-50%)';
        notificationContainer.style.zIndex = '9999';
        document.body.appendChild(notificationContainer);
    }
    
    // Erstelle die Benachrichtigung
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show`;
    notification.role = 'alert';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Schließen"></button>
    `;
    
    // Füge die Benachrichtigung zum Container hinzu
    notificationContainer.appendChild(notification);
    
    // Entferne die Benachrichtigung nach 5 Sekunden
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notificationContainer.removeChild(notification);
        }, 300);
    }, 5000);
}