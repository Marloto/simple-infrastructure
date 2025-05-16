/**
 * NodeCache - Manages the persistence of node positions in the diagram
 * Continuously stores positions and can load them from various sources
 */
export class NodeCache {
    constructor(options = {}) {
        this.positions = new Map();
        this.options = {
            useLocalStorage: options.useLocalStorage || false,
            localStorageKey: options.localStorageKey || 'system_visualizer_node_positions',
            debounceTime: options.debounceTime || 500, // ms between local saves
            persistGroups: options.persistGroups || true
        };

        // Debounce timer for LocalStorage updates
        this.saveTimer = null;

        // Load from LocalStorage on initialization
        if (this.options.useLocalStorage) {
            this.loadFromLocalStorage();
        }
    }

    /**
     * Stores the position of a node
     * @param {string} id - The ID of the node
     * @param {Object} position - The position {x, y, vx, vy} and optionally other properties
     */
    set(id, position) {
        if (!id) return;

        // Set current position
        this.positions.set(id, {
            x: position.x,
            y: position.y,
            vx: position.vx || 0,
            vy: position.vy || 0,
            // Optionally more metadata
            lastUpdated: Date.now(),
            isFixed: position.isFixed || false,
        });

        this.saveToLocalStorage();
    }

    /**
     * Updates multiple nodes at once
     * @param {Array} nodes - Array of nodes with id and position data
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
                    isFixed: node.isFixed || false,
                });
                updated = true;
            }
        });

        if (updated) {
            this.saveToLocalStorage();
        }
    }

    /**
     * Retrieves the stored position of a node
     * @param {string} id - The ID of the node
     * @returns {Object|null} The stored position or null
     */
    get(id) {
        return this.positions.get(id) || null;
    }

    /**
     * Checks if a position exists for a node
     * @param {string} id - The ID of the node
     * @returns {boolean} True if position exists
     */
    has(id) {
        return this.positions.has(id);
    }

    /**
     * Removes an entry from the cache
     * @param {string} id - The ID of the node
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
     * Save to LocalStorage
     */
    doSaveToLocalStorage() {
        if (!this.options.useLocalStorage) return;

        try {
            // Convert the Map to an array of [id, data] pairs
            const positionsArray = Array.from(this.positions);
            localStorage.setItem(
                this.options.localStorageKey,
                JSON.stringify(positionsArray)
            );
        } catch (error) {
            console.warn('Error saving positions:', error);
        }
    }

    /**
     * Load from LocalStorage
     */
    loadFromLocalStorage() {
        if (!this.options.useLocalStorage) return;

        try {
            const stored = localStorage.getItem(this.options.localStorageKey);
            if (stored) {
                // Convert array of [id, data] pairs back to Map
                const positionsArray = JSON.parse(stored);
                this.positions = new Map(positionsArray);
            }
        } catch (error) {
            console.warn('Error loading positions:', error);
        }
    }

    /**
     * Clear cache
     * @param {boolean} alsoLocalStorage - If true, also clear LocalStorage
     */
    clear(alsoLocalStorage = false) {
        this.positions.clear();

        if (alsoLocalStorage && this.options.useLocalStorage) {
            localStorage.removeItem(this.options.localStorageKey);
        }
    }
}