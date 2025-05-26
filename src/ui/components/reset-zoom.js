import { UIComponent } from '../base/ui-component.js';

export class ResetZoomHelper extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    bindEvents() {
        this.dependencies.toolbar.button('bi-aspect-ratio', 'Rezet zoom', () => {
            this.dependencies.visualizer.resetZoom();
        }, 'view');
    }
}