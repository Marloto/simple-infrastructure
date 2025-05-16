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