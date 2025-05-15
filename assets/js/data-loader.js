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
function uploadSystemData(dataManager) {
    // Erstelle ein verstecktes Datei-Input-Element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.yaml,.yml';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    // Klick auf das versteckte Input-Element simulieren
    fileInput.click();
    
    // Event-Listener für die Dateiauswahl
    fileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const yamlContent = e.target.result;
                const parsedData = jsyaml.load(yamlContent);
                
                // Validiere die Datenstruktur
                if (!validateSystemData(parsedData)) {
                    showNotification('Ungültiges Datenformat', 'danger');
                    return;
                }
                
                // Daten im DataManager aktualisieren
                dataManager.setData(parsedData);
                
                showNotification('Daten erfolgreich geladen', 'success');
            } catch (error) {
                console.error('Fehler beim Parsen der YAML-Datei:', error);
                showNotification('Ungültiges YAML-Format', 'danger');
            }
        };
        
        reader.readAsText(file);
        
        // Entferne das temporäre Input-Element
        document.body.removeChild(fileInput);
    });
}

/**
 * Validiert die hochgeladene Datenstruktur
 * @param {Object} data - Die zu validierende Datenstruktur
 * @returns {boolean} True, wenn die Daten valide sind
 */
function validateSystemData(data) {
    // Überprüfe, ob die Grundstruktur vorhanden ist
    if (!data || !Array.isArray(data.systems) || !Array.isArray(data.dependencies)) {
        return false;
    }
    
    // Überprüfe, ob alle Systeme eine ID haben
    const allSystemsHaveId = data.systems.every(system => !!system.id);
    if (!allSystemsHaveId) {
        return false;
    }
    
    // Überprüfe, ob alle Abhängigkeiten gültige source und target haben
    const allDependenciesValid = data.dependencies.every(dep => 
        !!dep.source && !!dep.target && 
        data.systems.some(sys => sys.id === dep.source) && 
        data.systems.some(sys => sys.id === dep.target)
    );
    
    return allDependenciesValid;
}

/**
 * Lädt die aktuellen Systemdaten als YAML-Datei herunter
 */
function downloadSystemData(dataManager) {
    const currentData = dataManager.getData();
    
    if (!currentData || !currentData.systems || currentData.systems.length === 0) {
        showNotification('Keine Daten zum Herunterladen verfügbar', 'warning');
        return;
    }
    
    try {
        // Konvertiere das JS-Objekt zu YAML
        const yamlString = jsyaml.dump(currentData);
        
        // Erstelle einen Blob und einen Download-Link
        const blob = new Blob([yamlString], { type: 'application/x-yaml' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'systems_export.yaml';
        document.body.appendChild(a);
        a.click();
        
        // Räume auf
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Daten erfolgreich heruntergeladen', 'success');
    } catch (error) {
        console.error('Fehler beim Herunterladen der Daten:', error);
        showNotification('Fehler beim Herunterladen', 'danger');
    }
}