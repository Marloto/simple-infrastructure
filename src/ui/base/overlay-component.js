import { UIComponent } from './ui-component.js';

export class OverlayComponent extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }
    
    show() {
        this.element.classList.add('active');
        this.onShow();
        this.emit('shown');
    }
    
    hide() {
        this.element.classList.remove('active');
        this.onHide();
        this.emit('hidden');
    }
    
    toggle() {
        if (this.isActive()) {
            this.hide();
        } else {
            this.show();
        }
    }

    isActive() {
        return this.element.classList.contains('active');
    }
    
    onShow() {
        // Override in subclasses
    }
    
    onHide() {
        // Override in subclasses
    }
}