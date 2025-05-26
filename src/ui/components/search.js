import { OverlayComponent } from '../base/overlay-component.js';

const createSearchOverlay = () => `
    <div class="search-overlay overlay">
        <div class="overlay-header">
            <h5>Search</h5>
            <button class="btn-close close-overlay" data-close-target="search-panel"></button>
        </div>
        <div class="overlay-body">
            <div class="input-group mb-3">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input type="text" class="form-control system-search" placeholder="Search system...">
            </div>
            <div class="list-group search-results">
                <!-- Search results will be inserted here -->
            </div>
        </div>
    </div>
`;

export class SearchOverlay extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
        this.overlayElement = this.render(createSearchOverlay());
        this.element.appendChild(this.overlayElement);
    }

    bindEvents() {
        // Toolbar button to toggle search overlay
        this.dependencies.toolbar.button('bi-search', 'Search', () => {
            this.toggle();
        }, 'view');

        // Close button
        this.overlayElement.querySelector('.close-overlay').addEventListener('click', () => {
            this.hide();
        });

        // Search field
        const input = this.overlayElement.querySelector('.system-search');
        input.addEventListener('input', () => this.performSearch(input.value));
    }

    toggle() {
        document.querySelectorAll('.overlay').forEach(overlay => {
            if (overlay !== this.overlayElement) overlay.classList.remove('active');
        });
        if (this.overlayElement.classList.contains('active')) {
            this.hide();
        } else {
            this.show();
        }
    }

    onShow() {
        this.overlayElement.classList.add('active');
    }

    onHide() {
        this.overlayElement.classList.remove('active');
    }

    performSearch(query) {
        const resultsContainer = this.overlayElement.querySelector('.search-results');

        if (!resultsContainer) {
            console.error('Search results container not found');
            return;
        }

        if (!query || query.trim() === '') {
            resultsContainer.innerHTML = '';
            return;
        }

        const searchTerm = query.toLowerCase().trim();

        // Search systems
        const results = this.dependencies.dataManager.getData().systems.filter(system => {
            return (
                system.name.toLowerCase().includes(searchTerm) ||
                system.description.toLowerCase().includes(searchTerm) ||
                (system.tags && system.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
                (system.group && system.group.toLowerCase().includes(searchTerm)) // Also search in groups
            );
        });

        // Display results
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="alert alert-info">No systems found.</div>';
        } else {
            let html = '';

            results.forEach(system => {
                html += `
                    <button class="list-group-item list-group-item-action" data-system-id="${system.id}">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">${system.name}</h6>
                            <span class="badge bg-${this.dependencies.visualizer.getCategoryClass(system.category)}">${system.category}</span>
                        </div>
                        <small>${system.description}</small>
                        ${system.group ? `<br><small><span class="badge bg-info">Group: ${system.group}</span></small>` : ''}
                    </button>
                `;
            });

            resultsContainer.innerHTML = html;

            // Event listeners for clicks on search results
            const resultItems = resultsContainer.querySelectorAll('.list-group-item');
            resultItems.forEach(item => {
                item.addEventListener('click', () => {
                    const systemId = item.getAttribute('data-system-id');
                    const system = this.dependencies.dataManager.getData().systems.find(s => s.id === systemId);

                    if (system) {
                        this.dependencies.visualizer.showSystemDetails(system);
                        this.hide();
                    }
                });
            });
        }
    }
}