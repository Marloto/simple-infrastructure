/**
 * NodeCache - Verwaltet die Persistenz von Knotenpositionen im Diagramm
 * Speichert kontinuierlich die Positionen und kann diese aus verschiedenen Quellen laden
 */
class NodeCache {
    constructor(options = {}) {
        this.positions = new Map();
        this.options = {
            useLocalStorage: options.useLocalStorage || false,
            localStorageKey: options.localStorageKey || 'system_visualizer_node_positions',
            debounceTime: options.debounceTime || 500, // ms zwischen lokalem Speichern
            persistGroups: options.persistGroups || true
        };

        // Debounce-Timer für LocalStorage-Updates
        this.saveTimer = null;

        // Beim Initialisieren aus dem LocalStorage laden
        if (this.options.useLocalStorage) {
            this.loadFromLocalStorage();
        }
    }

    /**
     * Speichert die Position eines Knotens
     * @param {string} id - Die ID des Knotens
     * @param {Object} position - Die Position {x, y, vx, vy} und optional weitere Eigenschaften
     */
    set(id, position) {
        if (!id) return;

        // Aktuelle Position setzen
        this.positions.set(id, {
            x: position.x,
            y: position.y,
            vx: position.vx || 0,
            vy: position.vy || 0,
            // Optional weitere Metadaten
            lastUpdated: Date.now(),
            group: position.group
        });

        this.saveToLocalStorage();
    }

    /**
     * Aktualisiert mehrere Knoten auf einmal
     * @param {Array} nodes - Array von Knoten mit id und Positionsdaten
     */
    updateBatch(nodes) {
        if (!Array.isArray(nodes)) return;

        let updated = false;
        nodes.forEach(node => {
            if (node.id && (node.x !== undefined && node.y !== undefined)) {
                this.positions.set(node.id, {
                    x: node.x,
                    y: node.y,
                    vx: node.vx || 0,
                    vy: node.vy || 0,
                    lastUpdated: Date.now(),
                    group: node.group
                });
                updated = true;
            }
        });

        if (updated) {
            this.saveToLocalStorage();
        }
    }

    /**
     * Holt die gespeicherte Position eines Knotens
     * @param {string} id - Die ID des Knotens
     * @returns {Object|null} Die gespeicherte Position oder null
     */
    get(id) {
        return this.positions.get(id) || null;
    }

    /**
     * Prüft, ob eine Position für einen Knoten existiert
     * @param {string} id - Die ID des Knotens
     * @returns {boolean} True, wenn Position existiert
     */
    has(id) {
        return this.positions.has(id);
    }

    /**
     * Entfernt einen Eintrag aus dem Cache
     * @param {string} id - Die ID des Knotens
     */
    remove(id) {
        this.positions.delete(id);
        this.saveToLocalStorage();
    }

    saveToLocalStorage() {
        if (this.options.useLocalStorage) {
            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => {
                this.doSaveToLocalStorage();
            }, this.options.debounceTime);
        }
    }

    /**
     * In den LocalStorage speichern
     */
    doSaveToLocalStorage() {
        if (!this.options.useLocalStorage) return;

        try {
            // Umwandeln der Map in ein Array von [id, data] Paaren
            const positionsArray = Array.from(this.positions);
            localStorage.setItem(
                this.options.localStorageKey,
                JSON.stringify(positionsArray)
            );
        } catch (error) {
            console.warn('Fehler beim Speichern der Positionen:', error);
        }
    }

    /**
     * Aus dem LocalStorage laden
     */
    loadFromLocalStorage() {
        if (!this.options.useLocalStorage) return;

        try {
            const stored = localStorage.getItem(this.options.localStorageKey);
            if (stored) {
                // Array von [id, data] Paaren zurück in Map umwandeln
                const positionsArray = JSON.parse(stored);
                this.positions = new Map(positionsArray);
            }
        } catch (error) {
            console.warn('Fehler beim Laden der Positionen:', error);
        }
    }

    /**
     * Cache leeren
     * @param {boolean} alsoLocalStorage - Wenn true, auch den LocalStorage leeren
     */
    clear(alsoLocalStorage = false) {
        this.positions.clear();

        if (alsoLocalStorage && this.options.useLocalStorage) {
            localStorage.removeItem(this.options.localStorageKey);
        }
    }
}