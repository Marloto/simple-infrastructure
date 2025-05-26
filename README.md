# Webbased IT Infrastructure Visualization

![GitHub Actions Workflow Status](https://github.com/marloto/simple-infrastructure/actions/workflows/deploy.yml/badge.svg)

An interactive web application for visualizing and managing IT infrastructures and their dependencies.

![Screenshot of the application](./screenshot.png)

_Disclaimer: The majority of this web-based tool was generated with Claude and GitHub Copilot. Based on a basic idea, the relevant components were created through several requirement-driven dialogues. The architecture has been significantly refactored to ensure proper separation of concerns, with business logic cleanly separated from UI components and a component-based architecture for maintainability._

## Features

- **Interactive Graph**: Visualize IT systems and their dependencies as an interactive graph
- **System Management**: Add, edit, and delete IT systems with intuitive modals
- **Connection Management**: Create and manage dependencies between systems with drag-and-drop
- **Grouping**: Organize systems into groups and visually cluster them
- **Filtering and Search**: Filter systems by category, status, and search by name or tags
- **Export/Import**: Export and import data in YAML format
- **Position Saving**: Automatically save node positions for consistent layouts
- **Undo/Redo**: Full history management with keyboard shortcuts (Ctrl+Z/Ctrl+Shift+Z)
- **LLM Integration**: Chat-based infrastructure management via LLM APIs (Claude, OpenAI, or custom)
- **Image Export**: Export visualizations as SVG or PNG

## Demo

A live demo is available at: [https://marloto.github.io/simple-infrastructure/](https://marloto.github.io/simple-infrastructure/)

## Technologies

- **D3.js**: For interactive visualization and graph layout
- **Bootstrap 5**: For responsive UI/UX design
- **JavaScript (ES6+)**: Modern ES modules with component-based architecture
- **Webpack**: For bundling JavaScript modules
- **GitHub Actions**: For CI/CD and automatic deployment
- **LocalStorage**: For client-side data persistence, nothing is stored externally
- **Web Crypto API**: For secure storage of API keys

## Local Development

### Prerequisites

- Node.js (version 14 or higher)
- npm (version 6 or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/marloto/simple-infrastructure.git
cd simple-infrastructure
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. For a production build:
```bash
npm run build
```

## Architecture

The application follows a component-based architecture with separation of concerns:

### Core Architecture Principles

- **Business Logic Layer**: Pure JavaScript classes handling data management
- **UI Component Layer**: Modular UI components with template-based rendering
- **Event-Driven Communication**: Loose coupling between components via events
- **Dependency Injection**: Explicit dependencies for better testability

### Main Components

#### Business Logic (Managers)
- **`DataManager`**: Central data source and state management
- **`HistoryManager`**: Undo/redo functionality with state tracking
- **`LlmIntegrationManager`**: LLM API integration and natural language processing
- **`LlmConfigManager`**: Configuration management for LLM settings

#### UI Components
- **`Toolbar`**: Centralized button management and grouping
- **`SystemVisualizer`**: Main D3.js visualization component
- **`EditSystemComponent`**: System creation and editing modal
- **`ConnectionModeComponent`**: Drag-and-drop connection creation
- **`SearchOverlay`**: System search functionality
- **`FilterOverlay`**: System filtering interface
- **`DetailsOverlay`**: System details display
- **`LegendOverlay`**: System details display
- **`ChatInterface`** / **`ChatConfig`**: LLM chat interface and config

#### UI Component Base Classes
- **`UIComponent`**: Base class for all UI components
- **`OverlayComponent`**: Base class for overlay-style UI elements

### Component Communication

Components communicate through:
- **Events**: Using the built-in EventEmitter for loose coupling
- **Dependency Injection**: Explicit dependencies passed via constructor
- **Data Flow**: Unidirectional data flow from DataManager to UI components

## Data Model

The data model is based on YAML format and consists of two main components:

### Systems

Systems represent IT components with the following properties:
- `id`: Unique identifier
- `name`: Display name of the system
- `description`: Detailed description
- `category`: Category (core, legacy, data, service, external)
- `groups`: Array of group names for visual clustering
- `status`: Operational status (active, planned, deprecated, retired)
- `knownUsage`: Whether usage is documented (true/false)
- `tags`: Array of searchable tags (optional)

### Dependencies

Connections between systems with the following properties:
- `source`: ID of the source system
- `target`: ID of the target system
- `type`: Type of connection (data, integration, authentication, monitoring)
- `description`: Human-readable description of the connection
- `protocol`: Technical protocol used (e.g., REST, HTTPS, TCP)

### Example

```yaml
systems:
  - id: webapp
    name: Web Application Frontend
    description: User interface for end users, runs in the browser
    category: service
    groups: 
      - frontend
      - customer-facing
    status: active
    knownUsage: true
    tags:
      - web
      - ui
      - react

  - id: backend
    name: Application Backend
    description: Server-side logic and API for the web application
    category: core
    status: active
    groups: 
      - backend
      - api
    knownUsage: true
    tags:
      - api
      - nodejs
      - rest

  - id: database
    name: Primary Database
    description: PostgreSQL database storing application data
    category: data
    groups:
      - backend
      - storage
    status: active
    knownUsage: true
    tags:
      - postgresql
      - persistence

dependencies:
  - source: webapp
    target: backend
    type: data
    description: Frontend fetches data via REST API
    protocol: HTTPS

  - source: backend
    target: database
    type: data
    description: Backend persists and retrieves application data
    protocol: PostgreSQL
```

## Contributing

Contributions are welcome! The codebase follows modern JavaScript patterns and clean architecture principles.

### Development Guidelines
- Follow the existing component structure
- Use dependency injection for testability
- Maintain separation between business logic and UI
- Add proper JSDoc documentation for new methods
- Use the existing event system for component communication

### Steps
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing architectural patterns
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [D3.js](https://d3js.org/) for the powerful visualization library
- [Bootstrap](https://getbootstrap.com/) for the UI framework
- [js-yaml](https://github.com/nodeca/js-yaml) for YAML parsing and serialization
- [Anthropic Claude](https://www.anthropic.com/) for AI assistance in development
- The open-source community for inspiration and best practices