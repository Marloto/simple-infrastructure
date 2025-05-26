import { UIComponent } from '../base/ui-component.js';

export class HistoryHelper extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
    }

    bindEvents() {
        this.undoBtn = this.dependencies.toolbar.button('bi-arrow-counterclockwise', 'Undo', () => {
            this.dependencies.historyManager.undo();
        }, 'history', ["upload-data"]);
        this.redoBtn = this.dependencies.toolbar.button('bi-arrow-clockwise', 'Redo', () => {
            this.dependencies.historyManager.redo();
        }, 'history', ["download-data"]);

        this.dependencies.historyManager.on('historyUpdated', () => {
            this.updateUI();
        });

        this.updateUI();
    }

    updateUI() {
        if (this.undoBtn) {
            this.undoBtn.disabled = !this.dependencies.historyManager.canUndo();
            this.undoBtn.title = this.dependencies.historyManager.canUndo() ? 'Undo (Ctrl+Z)' : 'Nothing to undo';
        }

        if (this.redoBtn) {
            this.redoBtn.disabled = !this.dependencies.historyManager.canRedo();
            this.redoBtn.title = this.dependencies.historyManager.canRedo() ? 'Redo (Ctrl+Shift+Z)' : 'Nothing to redo';
        }
    }
}