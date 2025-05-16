import { showNotification } from './utilities.js';


/**
 * Opens a file dialog for the user to upload a YAML file containing system data.
 * Parses and validates the selected YAML file, updates the DataManager with the new data,
 * refreshes the visualization, and displays notifications based on the outcome.
 *
 * Utilizes a hidden file input element to trigger the file selection dialog.
 * Supports files with .yaml or .yml extensions.
 *
 * @function
 * @returns {void}
 */
export function uploadSystemData(dataManager) {
    // Create a hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.yaml,.yml';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    // Simulate a click on the hidden input element
    fileInput.click();
    
    // Event listener for file selection
    fileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const yamlContent = e.target.result;
                const parsedData = jsyaml.load(yamlContent);
                
                // Validate the data structure
                if (!validateSystemData(parsedData)) {
                    showNotification('Invalid data format', 'danger');
                    return;
                }
                
                // Update data in DataManager
                dataManager.setData(parsedData);
                
                showNotification('Data loaded successfully', 'success');
            } catch (error) {
                console.error('Error parsing the YAML file:', error);
                showNotification('Invalid YAML format', 'danger');
            }
        };
        
        reader.readAsText(file);
        
        // Remove the temporary input element
        document.body.removeChild(fileInput);
    });
}

/**
 * Validates the uploaded data structure
 * @param {Object} data - The data structure to validate
 * @returns {boolean} True if the data is valid
 */
export function validateSystemData(data) {
    // Check if the basic structure exists
    if (!data || !Array.isArray(data.systems) || !Array.isArray(data.dependencies)) {
        return false;
    }
    
    // Check if all systems have an ID
    const allSystemsHaveId = data.systems.every(system => !!system.id);
    if (!allSystemsHaveId) {
        return false;
    }
    
    // Check if all dependencies have valid source and target
    const allDependenciesValid = data.dependencies.every(dep => 
        !!dep.source && !!dep.target && 
        data.systems.some(sys => sys.id === dep.source) && 
        data.systems.some(sys => sys.id === dep.target)
    );
    
    return allDependenciesValid;
}

/**
 * Downloads the current system data as a YAML file
 */
export function downloadSystemData(dataManager) {
    const currentData = dataManager.getData();
    
    if (!currentData || !currentData.systems || currentData.systems.length === 0) {
        showNotification('No data available for download', 'warning');
        return;
    }
    
    try {
        // Convert the JS object to YAML
        const yamlString = jsyaml.dump(currentData);
        
        // Create a Blob and a download link
        const blob = new Blob([yamlString], { type: 'application/x-yaml' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'systems.yaml';
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Data downloaded successfully', 'success');
    } catch (error) {
        console.error('Error downloading the data:', error);
        showNotification('Error during download', 'danger');
    }
}
/**
 * Exports the current visualization as an SVG file
 */
export function downloadVisualizationAsSVG() {
    // Find the SVG element
    const svgElement = document.querySelector('#visualization-container svg');
    if (!svgElement) {
        showNotification('No visualization found to download', 'warning');
        return;
    }

    try {
        // Clone the SVG to not modify the original
        const clonedSvg = svgElement.cloneNode(true);
        
        // Add CSS styles inline for the exported SVG
        const styles = document.createElement('style');
        for (const sheet of document.styleSheets) {
            try {
                if (sheet.href && sheet.href.includes('styles.css')) {
                    // Add only relevant CSS styles
                    for (const rule of sheet.cssRules) {
                        if (rule.selectorText && (
                            rule.selectorText.includes('.node') || 
                            rule.selectorText.includes('.link') || 
                            rule.selectorText.includes('.group') ||
                            rule.selectorText.includes('svg') ||
                            rule.selectorText.includes('circle') ||
                            rule.selectorText.includes('text') ||
                            rule.selectorText.includes('path')
                        )) {
                            styles.textContent += rule.cssText + '\n';
                        }
                    }
                }
            } catch (err) {
                // Some stylesheets may not be accessible due to CORS
                console.warn('Could not access stylesheet:', err);
            }
        }
        
        // Add the styles to the SVG
        clonedSvg.insertBefore(styles, clonedSvg.firstChild);
        
        // Set width and height attributes
        const width = svgElement.clientWidth || 1200;
        const height = svgElement.clientHeight || 800;
        clonedSvg.setAttribute('width', width);
        clonedSvg.setAttribute('height', height);
        
        // Add viewBox if it doesn't exist
        if (!clonedSvg.getAttribute('viewBox')) {
            clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        }
        
        // Convert SVG to XML string
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(clonedSvg);
        
        // Add XML declaration and DOCTYPE
        svgString = '<?xml version="1.0" standalone="no"?>\n' + svgString;
        
        // Create a blob and download link
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        // Set download attributes
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `infrastructure-map-${timestamp}.svg`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Visualization downloaded successfully', 'success');
    } catch (error) {
        console.error('Error downloading the SVG file:', error);
        showNotification('Error during download', 'danger');
    }
}

/**
 * Exports the current visualization as a PNG file
 */
export function downloadVisualizationAsPNG() {
    // Find the SVG element
    const svgElement = document.querySelector('#visualization-container svg');
    if (!svgElement) {
        showNotification('No visualization found to download', 'warning');
        return;
    }

    try {
        // Clone the SVG to not modify the original
        const clonedSvg = svgElement.cloneNode(true);

        // Ensure that all link paths have no fill
        const linkPaths = clonedSvg.querySelectorAll('.link');
        linkPaths.forEach(path => {
            // Set basic properties for all links
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-width', '1.5px');
            path.setAttribute('stroke-opacity', '0.6');
            
            // Set color depending on connection type
            const linkType = path.getAttribute('data-type');
            switch(linkType) {
                case 'data':
                    path.setAttribute('stroke', '#0d6efd');
                    break;
                case 'integration':
                    path.setAttribute('stroke', '#198754');
                    break;
                case 'authentication':
                    path.setAttribute('stroke', '#dc3545');
                    break;
                case 'monitoring':
                    path.setAttribute('stroke', '#6c757d');
                    break;
                default:
                    path.setAttribute('stroke', '#999');
            }
        });
        
        // Set width and height attributes
        const width = svgElement.clientWidth || 1200;
        const height = svgElement.clientHeight || 800;
        clonedSvg.setAttribute('width', width);
        clonedSvg.setAttribute('height', height);
        
        // Add viewBox if it doesn't exist
        if (!clonedSvg.getAttribute('viewBox')) {
            clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        }
        
        // Convert SVG to XML string with inline styles
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(clonedSvg);
        
        // Create an Image object
        const img = new Image();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Set SVG as image source (as Data URL)
        img.onload = function() {
            // Fill background with white (SVG might have transparent background)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw SVG image on canvas
            ctx.drawImage(img, 0, 0);
            
            // Convert canvas to PNG and trigger download
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const pngUrl = canvas.toDataURL('image/png');
            
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `infrastructure-map-${timestamp}.png`;
            
            document.body.appendChild(link);
            link.click();
            
            // Clean up
            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
            
            showNotification('Visualization successfully downloaded as PNG', 'success');
        };
        
        // Handle error
        img.onerror = function() {
            console.error('Error loading SVG into Image object');
            showNotification('Error converting to PNG', 'danger');
        };
        
        // Create a Blob containing the SVG and convert to Data URL
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result;
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error('Error downloading as PNG:', error);
        showNotification('Error during download', 'danger');
    }
}
