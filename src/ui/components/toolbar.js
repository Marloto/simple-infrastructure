import { UIComponent } from '../base/ui-component.js';

export class Toolbar extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    group(name) {
        //<div class="btn-group"></div>
        if (!this._groups) {
            this._groups = new Map();
        }
        if (this._groups.has(name)) {
            return this._groups.get(name);
        }
        const group = document.createElement('div');
        group.classList.add('btn-group', 'me-1');
        this._groups.set(name, group);
        this.element.appendChild(group);
        return group;
    }

    button(icon, title, callback, group = 'default', additionalClasses = []) {
        const button = document.createElement('button');
        button.classList.add('btn', 'btn-dark', 'btn-sm');
        additionalClasses.forEach(cls => button.classList.add(cls));
        button.title = title;
        button.innerHTML = `<i class="bi ${icon}"></i>`;
        button.addEventListener('click', callback);
        this.group(group).appendChild(button);
        return button;
    }
}