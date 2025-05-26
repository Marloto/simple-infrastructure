import { UIComponent } from '../base/ui-component.js';
import { downloadSystemData } from '../../data-loader.js';

export class DownloadHelper extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    bindEvents() {
        this.dependencies.toolbar.button('bi-download', 'Download data', () => {
            downloadSystemData(this.dependencies.dataManager);
        }, 'import-export');
    }
}