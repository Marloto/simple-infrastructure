class PromptTemplate {
    constructor(template) {
        this.template = template;
    }

    // Methode 1: Template Literals (moderne ES6+ Syntax)
    formatWithTemplateString(variables) {
        return new Function(...Object.keys(variables), `return \`${this.template}\`;`)(...Object.values(variables));
    }

    // Methode 2: Named Parameters mit {{name}}
    formatWithNamedParams(variables) {
        return this.template.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] || "");
    }
}

class AbstractLlmApi {
    async generate() {
        throw new Error("Not implemented");
    }

    setSystemPrompt(systemPrompt) {
        this.systemPrompt = systemPrompt; 
    }

    getSystemPrompt() {
        return this.systemPrompt;
    }

    attachMessage(role, content) {
        if(!this.messages) {
            this.reset();
        }
        this.messages.push({ role, content });
    }

    attachMessageAsAssistant(content) {
        this.attachMessage(this.getAssistantRole(), content);
    }

    attachMessageAsUser(content) {
        this.attachMessage(this.getUserRole(), content);
    }

    reset() {
        this.messages = [];
    }

    extractMessages(line) {
        throw new Error("Not implemented");
    }

    getAssistantRole() {
        return "assistant";
    }
    getUserRole() {
        return "user";
    }
    getDetails() {
        return {"type": "unknown"};
    }
}

class ClaudeApi extends AbstractLlmApi {
    constructor(apiKey, model) {
        super();
        this.apiKey = apiKey;
        this.model = model;
    }

    getDetails() {
        return {"type": "claude", "model": this.model};
    }

    async generate() {
        try {
            const body = JSON.stringify({
                model: this.model || "claude-3-5-sonnet-20241022",
                max_tokens: 4096,
                stream: true,
                system: [{
                    type: "text",
                    cache_control: {"type": "ephemeral"},
                    text: this.systemPrompt
                }],
                messages: this.messages
            });

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
            }

            return response.body;
        } catch (error) {
            throw new Error(`Failed to generate alternative: ${error.message}`);
        }
    }

    extractMessages(line) {
        if (!line || line.trim() === '') {
            return '';
        }
        //console.log(`Message: ${line}`);
        const parsedData = JSON.parse(line);

        // We got a valid JSON message, but it might be an error
        if (parsedData.type === "error") {
            const error = new Error(`Stream error: ${parsedData.error?.type} - ${parsedData.error?.message}`);
            error.isStreamError = true;
            error.errorData = parsedData.error;
            throw error;
        }

        // We got a valid JSON message and it looks like a delta
        if (parsedData.delta && parsedData.delta.text) {
            return parsedData.delta.text;
        }
        
        return '';
    }
}

class OpenAiApi extends AbstractLlmApi {
    constructor(apiKey, model) {
        super();
        this.apiKey = apiKey;
        this.model = model;
    }

    getDetails() {
        return {"type": "openai", "model": this.model};
    }

    reset() {
        this.messages = [];
        if (this.systemPrompt) {
            this.attachMessage("system", this.systemPrompt);
        }
    }

    async generate() {
        try {
            const body = JSON.stringify({
                model: this.model || "gpt-4-turbo-preview",
                messages: this.messages,
                max_tokens: 4096,
                temperature: 0.7,
                stream: true
            });

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
            }

            return response.body;
        } catch (error) {
            throw new Error(`Failed to generate alternative: ${error.message}`);
        }
    }

    extractMessages(line) {
        const parsedData = JSON.parse(line);
        const token = parsedData.choices[0].delta.content || '';
        return token;
    }
}

class CustomBasedOnOpenAiApi extends AbstractLlmApi {
    constructor(apiKey, model, url) {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.url = url.endsWith('/') ? url.slice(0, -1) : url;
    }

    getDetails() {
        return {"type": "custom", "model": this.model, "url": this.url};
    }

    reset() {
        this.messages = [];
        if (this.systemPrompt) {
            this.attachMessage("system", this.systemPrompt);
        }
    }

    async generate() {
        const body = JSON.stringify({
            model: this.model || "",
            messages: this.messages,
            max_tokens: 1024,
            temperature: 0.7,
            stream: true
        });

        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        let response;
        const url = `${this.url}/v1/chat/completions`;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers,
                body
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
            }

            return response.body;
        } catch (error) {
            throw new Error(`Failed to generate alternative: ${error.message}\nRequest Details: ${JSON.stringify({ url, body, headers, response }, null, 2)}`);
        }
    }

    extractMessages(line) {
        const parsedData = JSON.parse(line);
        const token = parsedData.choices[0].delta.content || '';
        return token;
    }
}

class Generator {
    constructor(api, systemPrompt, promptPrefix, variables) {
        this.api = api;
        this.systemPrompt = systemPrompt;
        this.promptPrefix = promptPrefix;
        this.variables = variables;

        this.reset();
    }

    getApiDetails() {
        return this.api.getDetails();
    }

    reset() {
        // Create prompt templates to replace them with information from variables
        const systemPromptTemplate = new PromptTemplate(this.systemPrompt);

        // Set current system prompt
        this.api.setSystemPrompt(systemPromptTemplate.formatWithNamedParams(this.variables));

        // Reset message history, some providers might require to add this to the message list
        this.api.reset();
    }

    attachMessageAsAssistant(text) {
        this.api.attachMessageAsAssistant(text);
    }

    attachMessageAsUser(text) {
        this.api.attachMessageAsUser(text);
    }

    attachMessageAsUserUsingPrefix(variables) {
        const codePromptTemplate = new PromptTemplate(this.promptPrefix);
        this.api.attachMessageAsUser(codePromptTemplate.formatWithNamedParams(variables));
    }

    async generate() {
        return await this.api.generate();
    }

    extractMessages(line) {
        return this.api.extractMessages(line);
    }

    getMessages() {
        return this.api.messages.map(el => {
            let role = el.role;
            if(el.role === this.api.getUserRole()) {
                role = "user";
            } else if(el.role === this.api.getAssistantRole()) {
                role = "assistant";
            }
            return {
                role,
                content: el.content
            }
        });
    }

    restoreMessages(messages) {
        this.api.messages = messages.map(el => {
            let role = el.role;
            if (el.role === "user") {
                role = this.api.getUserRole();
            } else if (el.role === "assistant") {
                role = this.api.getAssistantRole();
            }
            return {
                role,
                content: el.content
            };
        });
    }

    getSystemPrompt() {
        return this.api.getSystemPrompt();
    }
}

export function createGenerator(variables, systemPrompt = "", promptPrefix = "", options = {}) {
    const llmType = options.llmType;
    const llmModel = options.llmModel;
    const llmApiKey = options.llmApiKey;

    let api;
    if (llmType === 'claude') {
        api = new ClaudeApi(llmApiKey, llmModel);
    } else if (llmType === 'openai') {
        api = new OpenAiApi(llmApiKey, llmModel);
    } else if (llmType === 'custom') {
        const llmUrl = options.llmUrl;
        api = new CustomBasedOnOpenAiApi(llmApiKey, llmModel, llmUrl);
    } else {
        throw new Error(`Unknown LLM type: ${llmType}`);
    }

    return new Generator(api, systemPrompt, promptPrefix, variables);
}

export async function handleSse(generator, callback) {
    const stream = await generator.generate();
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let result = '';
    let buffer = '';
    
    try {
        reading: while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            // Decodiere den Chunk und füge ihn zum Buffer hinzu
            buffer += decoder.decode(value, { stream: true });

            let pos;
            while ((pos = buffer.indexOf('\n\n')) >= 0) {
                const event = buffer.substring(0, pos);
                buffer = buffer.substring(pos + 2);

                const lines = event.split('\n');
                let data = '';
                
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        data += line.substring(5).trim();
                    }
                }

                if (data === '[DONE]') {
                    break reading;
                }

                if (data) {
                    try {
                        const token = generator.extractMessages(data);
                        result += token;
                        if (callback) {
                            callback(undefined, token);
                        }
                    } catch (error) {
                        if (error.isStreamError) {
                            console.error(`Stream error: ${error.message}`);
                            if (callback) {
                                callback(JSON.stringify({
                                    error: true,
                                    type: error.errorData?.type,
                                    message: error.errorData?.message
                                }));
                            }
                            break reading;
                        }
                        console.error('Failed to parse JSON:', error);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Stream processing error:', error);
    }
    
    return result;
}