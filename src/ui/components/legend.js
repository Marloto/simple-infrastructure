import { OverlayComponent } from '../base/overlay-component.js';

const createLegendOverlay = () => `
    <div class="legend-overlay overlay">
        <div class="overlay-header">
            <h5>Legend</h5>
            <button class="btn-close close-overlay"></button>
        </div>
        <div class="overlay-body">
            <h6>System categories</h6>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #0d6efd;"></div>
                <div>Core system</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #6c757d;"></div>
                <div>Legacy system</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #198754;"></div>
                <div>Data system</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #ffc107;"></div>
                <div>Service system</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #dc3545;"></div>
                <div>External system</div>
            </div>

            <h6 class="mt-3">System status</h6>
            <div class="legend-item">
                <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid #666;margin-right: 1rem;"></div>
                <div>Known usage</div>
            </div>
            <div class="legend-item">
                <div style="width: 20px; height: 20px; border-radius: 50%; border: 2px dashed #666;margin-right: 1rem;"></div>
                <div>Unknown usage</div>
            </div>

            <h6 class="mt-3">Connection types</h6>
            <div class="legend-item">
                <div style="width: 20px; height: 3px; background-color: #0d6efd;margin-right: 1rem;"></div>
                <div>Data exchange</div>
            </div>
            <div class="legend-item">
                <div style="width: 20px; height: 3px; background-color: #198754;margin-right: 1rem;"></div>
                <div>Integration</div>
            </div>
            <div class="legend-item">
                <div style="width: 20px; height: 3px; background-color: #dc3545;margin-right: 1rem;"></div>
                <div>Authentication</div>
            </div>
            <div class="legend-item">
                <div style="width: 20px; height: 3px; background-color: #6c757d;margin-right: 1rem;"></div>
                <div>Monitoring</div>
            </div>
        </div>
    </div>
`;

export class LegendOverlay extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
        this.overlayElement = this.render(createLegendOverlay());
        this.element.appendChild(this.overlayElement);
    }

    bindEvents() {
        // Toolbar button to toggle search overlay
        this.dependencies.toolbar.button('bi-info-circle', 'Legend', () => {
            this.toggle();
        }, 'view');

        // Close button
        this.overlayElement.querySelector('.close-overlay').addEventListener('click', () => {
            this.hide();
        });
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