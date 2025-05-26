import { EventEmitter  } from "./event-emitter.js";
import { showNotification } from './utilities.js';

/**
 * HistoryManager 
 */
export class HistoryManager extends EventEmitter{
    constructor(dataManager, options = {}) {
        super();
        this.dataManager = dataManager;
        this.options = {
            maxHistorySize: options.maxHistorySize || 50,
            debounceTime: options.debounceTime || 500,
            ...options
        };

        // History stacks
        this.undoStack = [];  // Enthält VERGANGENE Zustände
        this.redoStack = [];  // Enthält ZUKÜNFTIGE Zustände
        
        // State tracking
        this.debounceTimer = null;
        this.isPerformingHistoryOperation = false;
        this.lastSavedState = null; // Für Vergleich

        this.initialize();
    }

    initialize() {
        // Initialen Zustand speichern
        this.saveInitialState();

        // WICHTIG: Wir speichern VOR Änderungen, nicht nach!
        this.dataManager.on('dataChanged', () => {
            if (this.isPerformingHistoryOperation) return;
            
            // Wenn das Event gefeuert wird, sind die Daten bereits geändert
            // Aber wir haben noch den alten Zustand in lastSavedState
            // Der gehört jetzt in den undoStack!
            this.handleDataChanged();
        });

        this.setupKeyboardShortcuts();
        console.log('CorrectedHistoryManager initialized');
    }

    /**
     * Speichert den initialen Zustand
     */
    saveInitialState() {
        this.lastSavedState = this.deepClone(this.dataManager.getData());
        this.emit('historyUpdated');
    }

    /**
     * Wird aufgerufen wenn sich Daten geändert haben
     * Zu diesem Zeitpunkt sind die Daten bereits NEU, aber lastSavedState ist ALT
     */
    handleDataChanged() {
        // Clear debounce timer falls vorhanden
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounced handling
        this.debounceTimer = setTimeout(() => {
            this.processPendingChange();
        }, this.options.debounceTime);
    }

    /**
     * Verarbeitet eine ausstehende Änderung
     */
    processPendingChange() {
        const currentData = this.dataManager.getData();
        
        // Nichts zu tun wenn keine Änderung
        if (this.lastSavedState && this.areStatesEqual(this.lastSavedState, currentData)) {
            return;
        }

        // Den ALTEN Zustand (vor der Änderung) in den undoStack
        if (this.lastSavedState) {
            const undoSnapshot = {
                data: this.deepClone(this.lastSavedState),
                timestamp: Date.now()
            };

            this.undoStack.push(undoSnapshot);

            // Redo-Stack leeren
            this.redoStack = [];

            // Stack-Größe begrenzen
            if (this.undoStack.length > this.options.maxHistorySize) {
                this.undoStack.shift();
            }
        }

        // Neuen aktuellen Zustand für nächstes Mal merken
        this.lastSavedState = this.deepClone(currentData);
        
        this.emit('historyUpdated');
        console.log(`State change processed (${this.undoStack.length} undo states)`);
    }

    /**
     * Undo - Zum vorherigen Zustand zurückkehren
     */
    undo() {
        if (!this.canUndo()) {
            console.warn('Cannot undo: no previous states');
            return false;
        }

        // Pending operations canceln
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        // Aktuellen Zustand zu Redo-Stack hinzufügen
        const currentData = this.dataManager.getData();
        const redoSnapshot = {
            data: this.deepClone(currentData),
            timestamp: Date.now()
        };
        this.redoStack.push(redoSnapshot);

        // Vorherigen Zustand vom undoStack holen
        const previousSnapshot = this.undoStack.pop();

        // Zustand anwenden
        this.isPerformingHistoryOperation = true;
        this.dataManager.setData(previousSnapshot.data, true);
        this.lastSavedState = this.deepClone(previousSnapshot.data); // Wichtig: auch lastSavedState updaten
        this.isPerformingHistoryOperation = false;

        this.emit('historyUpdated');
        showNotification('Undone', 'info');

        console.log('Undo performed');
        return true;
    }

    /**
     * Redo - Zum nächsten Zustand vorwärts gehen
     */
    redo() {
        if (!this.canRedo()) {
            console.warn('Cannot redo: no future states');
            return false;
        }

        // Pending operations canceln
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        // Aktuellen Zustand zu Undo-Stack hinzufügen
        const currentData = this.dataManager.getData();
        const undoSnapshot = {
            data: this.deepClone(currentData),
            timestamp: Date.now()
        };
        this.undoStack.push(undoSnapshot);

        // Nächsten Zustand vom redoStack holen
        const nextSnapshot = this.redoStack.pop();

        // Zustand anwenden
        this.isPerformingHistoryOperation = true;
        this.dataManager.setData(nextSnapshot.data, true);
        this.lastSavedState = this.deepClone(nextSnapshot.data); // Wichtig: auch lastSavedState updaten
        this.isPerformingHistoryOperation = false;

        this.emit('historyUpdated');
        showNotification('Redone', 'info');

        console.log('Redo performed');
        return true;
    }

    /**
     * Prüft ob Undo möglich ist
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Prüft ob Redo möglich ist
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Löscht komplette History
     */
    clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
        this.lastSavedState = this.deepClone(this.dataManager.getData());
        this.emit('historyUpdated');
        console.log('History cleared');
    }

    /**
     * Deep Clone eines Objekts
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
        
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    }

    /**
     * Vergleicht zwei Zustände auf Gleichheit
     */
    areStatesEqual(state1, state2) {
        return JSON.stringify(state1) === JSON.stringify(state2);
    }

    /**
     * Keyboard Shortcuts einrichten
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                this.undo();
                return;
            }

            if (((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Z') ||
                (event.ctrlKey && event.key === 'y')) {
                event.preventDefault();
                this.redo();
                return;
            }
        });
    }

    /**
     * Debug Info - zeigt den aktuellen Zustand
     */
    getDebugInfo() {
        return {
            undoStackSize: this.undoStack.length,
            redoStackSize: this.redoStack.length,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            currentDataHash: JSON.stringify(this.dataManager.getData()).substring(0, 50) + '...',
            lastSavedStateHash: this.lastSavedState ? JSON.stringify(this.lastSavedState).substring(0, 50) + '...' : 'null'
        };
    }
}