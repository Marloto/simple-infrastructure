import { OverlayComponent } from '../base/overlay-component.js';

const createFilterOverlay = () => `
    <div class="filter-overlay overlay">
        <div class="overlay-header">
            <h5>Filter</h5>
            <button class="btn-close close-overlay" data-close-target="filter-panel"></button>
        </div>
        <div class="overlay-body">
            <h6>System categories</h6>
            <div class="mb-3">
                <div class="form-check">
                    <input class="form-check-input category-filter" type="checkbox" id="filter-core" value="core"
                        checked>
                    <label class="form-check-label" for="filter-core">Core</label>
                </div>
                <div class="form-check">
                    <input class="form-check-input category-filter" type="checkbox" id="filter-legacy"
                        value="legacy" checked>
                    <label class="form-check-label" for="filter-legacy">Legacy</label>
                </div>
                <div class="form-check">
                    <input class="form-check-input category-filter" type="checkbox" id="filter-data" value="data"
                        checked>
                    <label class="form-check-label" for="filter-data">Data</label>
                </div>
                <div class="form-check">
                    <input class="form-check-input category-filter" type="checkbox" id="filter-service"
                        value="service" checked>
                    <label class="form-check-label" for="filter-service">Service</label>
                </div>
                <div class="form-check">
                    <input class="form-check-input category-filter" type="checkbox" id="filter-external"
                        value="external" checked>
                    <label class="form-check-label" for="filter-external">External</label>
                </div>
            </div>

            <h6>System status</h6>
            <div class="mb-3">
                <div class="form-check">
                    <input class="form-check-input status-filter" type="checkbox" id="filter-known" value="known"
                        checked>
                    <label class="form-check-label" for="filter-known">Known usage</label>
                </div>
                <div class="form-check">
                    <input class="form-check-input status-filter" type="checkbox" id="filter-unknown"
                        value="unknown" checked>
                    <label class="form-check-label" for="filter-unknown">Unknown usage</label>
                </div>
            </div>

            <button class="btn btn-primary btn-sm w-100" id="apply-filters">Apply filters</button>
        </div>
    </div>
`;

export class FilterOverlay extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
        this.overlayElement = this.render(createFilterOverlay());
        this.element.appendChild(this.overlayElement);
    }

    bindEvents() {
        // Toolbar button to toggle search overlay
        this.dependencies.toolbar.button('bi-funnel', 'Filter', () => {
            this.toggle();
        }, 'view');

        // Close button
        this.overlayElement.querySelector('.close-overlay').addEventListener('click', () => {
            this.hide();
        });

        // Filter for system categories
        const categoryFilters = this.overlayElement.querySelectorAll('.category-filter');
        if (categoryFilters.length > 0) {
            categoryFilters.forEach(filter => {
                filter.addEventListener('change', () => {
                    const checkedCategories = Array.from(document.querySelectorAll('.category-filter:checked'))
                        .map(checkbox => checkbox.value);
                    this.dependencies.visualizer.activeFilters.categories = checkedCategories;
                });
            });
        }

        // Filter for system status
        const statusFilters = this.overlayElement.querySelectorAll('.status-filter');
        if (statusFilters.length > 0) {
            statusFilters.forEach(filter => {
                filter.addEventListener('change', () => {
                    const checkedStatuses = Array.from(document.querySelectorAll('.status-filter:checked'))
                        .map(checkbox => checkbox.value);
                    this.dependencies.visualizer.activeFilters.knownUsage = checkedStatuses;
                });
            });
        }

        // Apply filters
        const applyFiltersButton = this.overlayElement.querySelector('#apply-filters');
        if (applyFiltersButton) {
            applyFiltersButton.addEventListener('click', () => {
                this.dependencies.visualizer.applyFilters();
                this.hide();
            });
        }
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

}