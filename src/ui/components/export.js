import { UIComponent } from '../base/ui-component.js';
import { downloadVisualizationAsSVG, downloadVisualizationAsPNG } from '../../utils/data-loader.js';

export class ExportImage extends UIComponent {
    constructor(selector, dependencies = {}, options = {}) {
        super(selector, dependencies, options);
        this.dropupVisible = false;
        this.dropupMenu = null;
    }

    bindEvents() {
        this.exportButton = this.dependencies.toolbar.button('bi-image', 'Download image', (event) => {
            event.stopPropagation();
            this.exportImage();
        }, 'import-export');
    }
    
    exportImage() {
        // If the menu is already shown, remove it
        if (this.dropupVisible && this.dropupMenu) {
            document.body.removeChild(this.dropupMenu);
            this.dropupVisible = false;
            return;
        }

        // Create a dropdown menu below the button
        this.dropupMenu = document.createElement('div');
        this.dropupMenu.className = 'dropdown-menu show';
        this.dropupMenu.style.position = 'absolute';

        // Calculate position (below the button as a dropdown)
        const buttonRect = this.exportButton.getBoundingClientRect();
        this.dropupMenu.style.top = (buttonRect.bottom + 5) + 'px'; // 5px gap to the button
        this.dropupMenu.style.left = buttonRect.left + 'px';
        this.dropupMenu.style.minWidth = '140px';
        this.dropupMenu.style.backgroundColor = '#fff';
        this.dropupMenu.style.border = '1px solid rgba(0,0,0,.15)';
        this.dropupMenu.style.borderRadius = '.25rem';
        this.dropupMenu.style.padding = '.5rem 0';
        this.dropupMenu.style.zIndex = '1000';
        this.dropupMenu.style.boxShadow = '0 0.5rem 1rem rgba(0, 0, 0, 0.15)';

        // Add menu items
        this.dropupMenu.innerHTML = `
            <a class="dropdown-item px-3 py-2" href="#" id="download-svg">
                <i class="bi bi-filetype-svg me-2"></i>As SVG
            </a>
            <a class="dropdown-item px-3 py-2" href="#" id="download-png">
                <i class="bi bi-filetype-png me-2"></i>As PNG
            </a>
        `;

        // Add to body
        document.body.appendChild(this.dropupMenu);
        this.dropupVisible = true;

        // Event listeners for menu items
        document.getElementById('download-svg').addEventListener('click', function (e) {
            e.preventDefault();
            downloadVisualizationAsSVG();
            document.body.removeChild(this.dropupMenu);
            this.dropupVisible = false;
        });

        document.getElementById('download-png').addEventListener('click', function (e) {
            e.preventDefault();
            downloadVisualizationAsPNG();
            document.body.removeChild(this.dropupMenu);
            this.dropupVisible = false;
        });

        // Clicking outside the menu closes it
        document.addEventListener('click', function closeDropup(e) {
            if (this.dropupVisible && !this.dropupMenu.contains(e.target) && e.target !== this.dependencies.exportButton) {
                document.body.removeChild(this.dropupMenu);
                this.dropupVisible = false;
                document.removeEventListener('click', closeDropup);
            }
        });
    }
};