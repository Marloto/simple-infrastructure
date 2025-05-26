import { EventEmitter } from '../../event-emitter.js';

export class UIComponent extends EventEmitter {
    constructor(selector, dependencies = {}, options = {}) {
        super();

        this.element = this.resolveElement(selector);
        if (!this.element) {
            throw new Error(`Element '${selector}' not found`);
        }

        this.dependencies = dependencies;
        this.options = options;
    }

    render(template) {
        const div = document.createElement('div');
        div.innerHTML = template;
        return div.firstElementChild;
    }
    
    resolveElement(selector) {
        if (typeof selector === 'string') {
            return document.querySelector(selector);
        }
        if (selector instanceof HTMLElement) {
            return selector;
        }
        return null;
    }

    initialize() {
        this.setupDOM();
        this.bindEvents();
        this.setupDependencies();
        this.emit('initialized');
    }
    
    setupDOM() {
        // Override in subclasses
    }
    
    bindEvents() {
        // Override in subclasses
    }
    
    setupDependencies() {
        // Override in subclasses
    }

    destroy() {
        this.emit('destroyed');
    }
}