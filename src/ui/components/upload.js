import { UIComponent } from '../base/ui-component.js';
import { uploadSystemData } from '../../utils/data-loader.js';

export class UploadHelper extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    bindEvents() {
        this.dependencies.toolbar.button('bi-upload', 'Upload data', () => {
            uploadSystemData(this.dependencies.dataManager);
        }, 'import-export');
    }
}