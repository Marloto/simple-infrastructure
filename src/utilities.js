/**
 * Displays a notification at the top of the screen
 * @param {string} message - The message to display
 * @param {string} type - The Bootstrap type (success, danger, warning, info)
 */
export function showNotification(message, type = 'info') {
    // Check if a notification container exists
    let notificationContainer = document.getElementById('notification-container');
    
    if (!notificationContainer) {
        // Create a new container if none exists
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.top = '10px';
        notificationContainer.style.left = '50%';
        notificationContainer.style.transform = 'translateX(-50%)';
        notificationContainer.style.zIndex = '9999';
        document.body.appendChild(notificationContainer);
    }
    
    // Create the notification
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show`;
    notification.role = 'alert';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add the notification to the container
    notificationContainer.appendChild(notification);
    
    // Remove the notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notificationContainer.contains(notification)) {
                notificationContainer.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

/**
 * Initialisiert einen client-spezifischen Verschlüsselungsschlüssel
 * Falls noch nicht vorhanden, wird ein neuer generiert und gespeichert
 * @returns {string} Verschlüsselungsschlüssel für diesen Client
 */
function getOrCreateClientKey(recreate = false) {
  // Prüfen, ob bereits ein Client-Key existiert
  let clientKey = localStorage.getItem('_client_encryption_salt');
  
  // Falls nicht, einen neuen erstellen und speichern
  if (!clientKey || recreate) {
    // 32 zufällige Bytes generieren und als Hex-String speichern
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    clientKey = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    localStorage.setItem('_client_encryption_salt', clientKey);
  }
  
  // Kombination aus dem gespeicherten Salt und einigen browserspezifischen Daten
  const browserFingerprint = navigator.userAgent + navigator.language + screen.colorDepth;
  
  // Einfache (nicht kryptografische) Kombination der Werte
  return clientKey + '_' + browserFingerprint.split('').reduce((hash, char) => {
    return ((hash << 5) - hash) + char.charCodeAt(0);
  }, 0);
}

/**
 * Stores a value encrypted in localStorage
 * @param {string} storageKey - Key for localStorage 
 * @param {string} value - Value to store (e.g. API Key)
 * @param {string} password - Password for encryption
 * @returns {Promise<void>}
 */
export async function encryptAndStore(storageKey, value) {
    try {
        const password = getOrCreateClientKey();
        // Salt and IV for more security
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        // Derive a cryptographic key from the password
        const passwordKey = await crypto.subtle.importKey(
            'raw', 
            new TextEncoder().encode(password),
            { name: 'PBKDF2' },
            false, 
            ['deriveBits', 'deriveKey']
        );
        
        const aesKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );
        
        // Encrypt value
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            new TextEncoder().encode(value)
        );
        
        // Combine everything into an object and store as JSON in localStorage
        const encryptedObj = {
            salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
            iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
            data: Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('')
        };
        
        const jsonString = JSON.stringify(encryptedObj);
        const jsonStringBase64 = btoa(encodeURIComponent(jsonString).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1)));
        localStorage.setItem(storageKey, jsonStringBase64);
    } catch (error) {
        console.error('Encryption error:', error);
    }
}

/**
 * Reads an encrypted value from localStorage and decrypts it
 * @param {string} storageKey - Key for localStorage
 * @param {string} password - Password for decryption
 * @returns {Promise<string|null>} - Decrypted value or null on error
 */
export async function retrieveAndDecrypt(storageKey) {
    try {
        const password = getOrCreateClientKey();
        // Get encrypted data from localStorage
        const storedData = localStorage.getItem(storageKey);
        if (!storedData) return null;
        // Decode base64 to JSON string
        const jsonString = decodeURIComponent(Array.prototype.map.call(atob(storedData), c => 
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join(''));
        const encryptedObj = JSON.parse(jsonString);
        if (!encryptedObj) return null;
        
        // Convert hex strings back to Uint8Arrays
        const salt = new Uint8Array(encryptedObj.salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const iv = new Uint8Array(encryptedObj.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const encryptedData = new Uint8Array(encryptedObj.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        
        // Derive a cryptographic key from the password (same process as when storing)
        const passwordKey = await crypto.subtle.importKey(
            'raw', 
            new TextEncoder().encode(password),
            { name: 'PBKDF2' },
            false, 
            ['deriveBits', 'deriveKey']
        );
        
        const aesKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        
        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            encryptedData
        );
        
        // Return as string
        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}