import { OverlayComponent } from '../base/overlay-component.js';
import { showNotification } from '../../utilities.js';

const createDetailsOverlay = () => `
    <div class="details-overlay overlay">
        <div class="overlay-header">
            <h5 class="detail-title">System details</h5>
            <div class="btn-group me-2">
                <button class="btn btn-sm btn-outline-secondary edit-system-btn" title="Edit system">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary toggle-fix-btn" title="Lock system">
                    <i class="bi bi-lock"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-system-btn" title="Delete system">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <button class="btn-close close-overlay" data-close-target="details-panel"></button>
        </div>
        <div class="overlay-body" data-overscroll-behavior="contain" data-bs-smooth-scroll="true">
            <!-- System details will be inserted here -->
        </div>
    </div>
`;

export class DetailsOverlay extends OverlayComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
    }

    setupDOM() {
        this.overlayElement = this.render(createDetailsOverlay());
        this.element.appendChild(this.overlayElement);
    }

    bindEvents() {
        const detailTitle = this.overlayElement.querySelector('.detail-title');

        // Close button
        this.overlayElement.querySelector('.close-overlay').addEventListener('click', () => {
            this.hide();
        });

        // Update the overlay when data is changed
        this.dependencies.dataManager.on('dataChanged', () => {
            if (this.overlayElement.classList.contains('active')) {
                const systemId = detailTitle.getAttribute('data-system-id');
                if (systemId) {
                    const updatedSystem = this.dependencies.dataManager.getData().systems.find(sys => sys.id === systemId);
                    if (updatedSystem) {
                        this.showSystemDetails(updatedSystem);
                    } else {
                        this.overlayElement.classList.remove('active');
                    }
                }
            }
        });

        // Open overlay if element is clicked
        this.dependencies.visualizer.on('systemClicked', (event) => {
            this.showSystemDetails(event.system);
        });

        // Switch toggle fix button
        this.dependencies.visualizer.on('toggleFixed', (data) => {
            const systemId = detailTitle.getAttribute('data-system-id');
            const { id, state } = data;

            if (id !== systemId) return;

            const toggleButton = this.overlayElement.querySelector('.toggle-fix-btn');
            if (state) {
                toggleButton.classList.add('active');
                toggleButton.title = 'Release position';
                showNotification('Position has been fixed', 'info');
            } else {
                toggleButton.classList.remove('active');
                toggleButton.title = 'Fix position';
                showNotification('Position has been released', 'info');
            }
        });

        // Event-Handler für Bearbeiten- und Löschen-Buttons in der Detailansicht
        this.overlayElement.querySelector('.edit-system-btn').addEventListener('click', () => {
            const systemId = detailTitle.getAttribute('data-system-id');
            if (systemId) {
                this.dependencies.editSystemComponent.showSystemModal(systemId);
            }
        });

        this.overlayElement.querySelector('.delete-system-btn').addEventListener('click', () => {
            const systemId = detailTitle.getAttribute('data-system-id');
            if (systemId) {
                this.dependencies.deleteSystemComponent.showDeleteConfirmation(systemId);
            }
        });

        this.overlayElement.querySelector('.toggle-fix-btn').addEventListener('click', () => {
            const systemId = detailTitle.getAttribute('data-system-id');
            if (systemId) {
                this.dependencies.visualizer.toggleNodeFixed(systemId);
            }
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
    
    /**
     * Displays the system details in the overlay
     */
    showSystemDetails(system) {
        const detailsPanel = this.overlayElement;
        const detailsDiv = this.overlayElement.querySelector('.overlay-body');
        const detailTitle = this.overlayElement.querySelector('.detail-title');
        const data = this.dependencies.dataManager.getData();

        // Set title
        detailTitle.textContent = system.name;
        detailTitle.setAttribute('data-system-id', system.id);

        // Find incoming and outgoing dependencies
        const incomingDeps = data.dependencies.filter(dep => dep.target === system.id);
        const outgoingDeps = data.dependencies.filter(dep => dep.source === system.id);

        let html = `
        <div class="system-detail-card">
            <p class="mb-1">${system.description}</p>
            <div class="badge bg-${this.dependencies.visualizer.getCategoryClass(system.category)} mb-2">${system.category}</div>
            <p><strong>Status:</strong> ${system.status}</p>
            <p><strong>Known Usage:</strong> ${system.knownUsage ? 'Yes' : 'No'}</p>
        `;

        // Add group information - multi-group support
        const groups = [];
        if (Array.isArray(system.groups) && system.groups.length > 0) {
            groups.push(...system.groups);
        } else if (system.group && typeof system.group === 'string') {
            groups.push(system.group);
        }

        if (groups.length > 0) {
            html += `<p><strong>Groups:</strong> ${groups.map(group =>
                `<span class="badge bg-info">${group}</span>`).join(' ')}</p>`;
        }

        if (system.tags && system.tags.length > 0) {
            html += `<p><strong>Tags:</strong> ${system.tags.map(tag =>
                `<span class="badge bg-secondary">${tag}</span>`).join(' ')}</p>`;
        }

        if (incomingDeps.length > 0) {
            html += `<h6 class="mt-3">Incoming Connections</h6><ul class="list-group">`;
            incomingDeps.forEach(dep => {
                const source = data.systems.find(s => s.id === dep.source);
                html += `
                <li class="list-group-item">
                    <div class="d-flex w-100 justify-content-between">
                        <strong>${source ? source.name : 'Unknown'}</strong>
                        <span class="badge bg-secondary">${dep.protocol || 'Unknown'}</span>
                    </div>
                    <small>${dep.description || 'No description'}</small>
                </li>`;
            });
            html += `</ul>`;
        }

        if (outgoingDeps.length > 0) {
            html += `<h6 class="mt-3">Outgoing Connections</h6><ul class="list-group">`;
            outgoingDeps.forEach(dep => {
                const target = data.systems.find(s => s.id === dep.target);
                html += `
                <li class="list-group-item">
                    <div class="d-flex w-100 justify-content-between">
                        <strong>${target ? target.name : 'Unknown'}</strong>
                        <span class="badge bg-secondary">${dep.protocol || 'Unknown'}</span>
                    </div>
                    <small>${dep.description || 'No description'}</small>
                </li>`;
            });
            html += `</ul>`;
        }

        if (incomingDeps.length === 0 && outgoingDeps.length === 0) {
            html += `<div class="alert alert-warning mt-3">This system has no known connections.</div>`;
        }

        html += `</div>`;

        detailsDiv.innerHTML = html;

        // Show details panel
        detailsPanel.classList.add('active');

        // Adjust button state
        const toggleFixButton = document.querySelector('.toggle-fix-btn');
        const isFixed = this.dependencies.visualizer.isNodeFixed(system.id);
        if (toggleFixButton) {
            if (isFixed) {
                toggleFixButton.classList.add('active');
                toggleFixButton.title = 'Release position';
            } else {
                toggleFixButton.classList.remove('active');
                toggleFixButton.title = 'Fix position';
            }
        }
    }
}