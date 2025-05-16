/**
 * A simple EventEmitter class for managing custom events.
 *
 * @class
 * @example
 * const emitter = new EventEmitter();
 * emitter.on('event', data => console.log(data));
 * emitter.emit('event', { foo: 'bar' });
 */
export class EventEmitter {
    /**
     * Initializes the EventEmitter instance.
     * @constructor
     */
    constructor() {
        this.events = {};
    }

    /**
     * Registers a callback for the specified event.
     * @param {string} eventName - The name of the event.
     * @param {Function} callback - The callback function to register.
     * @returns {EventEmitter} The instance for chaining.
     */
    on(eventName, callback) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(callback);
        return this; // for chaining
    }

    /**
     * Removes a callback for the specified event.
     * If no callback is provided, removes all callbacks for the event.
     * @param {string} eventName - The name of the event.
     * @param {Function} [callback] - The callback function to remove.
     * @returns {EventEmitter} The instance for chaining.
     */
    off(eventName, callback) {
        if (!this.events[eventName]) return this;

        if (callback) {
            this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
        } else {
            delete this.events[eventName];
        }
        return this;
    }

    /**
     * Emits an event, calling all registered callbacks with the provided arguments.
     * @param {string} eventName - The name of the event.
     * @param {...any} args - Arguments to pass to the callbacks.
     * @returns {boolean} True if the event had listeners, false otherwise.
     */
    emit(eventName, ...args) {
        if (!this.events[eventName]) return false;

        this.events[eventName].forEach(callback => {
            callback(...args);
        });
        return true;
    }

    /**
     * Registers a callback that is called at most once for the specified event.
     * @param {string} eventName - The name of the event.
     * @param {Function} callback - The callback function to register.
     * @returns {EventEmitter} The instance for chaining.
     */
    once(eventName, callback) {
        const onceCallback = (...args) => {
            this.off(eventName, onceCallback);
            callback(...args);
        };

        return this.on(eventName, onceCallback);
    }
}