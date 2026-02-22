/**
 * AI Service for handling fetching from different providers.
 */
class AIService {
    constructor() {
        this.apiKey = '';
        this.provider = 'gemini';
        this.model = ''; // Custom model
        this.ollamaUrl = 'http://localhost:11434';
    }

    configure(provider, settings) {
        this.provider = provider || 'gemini';

        switch (this.provider) {
            case 'gemini':
                this.apiKey = settings.geminiApiKey || '';
                this.model = settings.geminiModel || '';
                break;
            case 'openai':
                this.apiKey = settings.openaiApiKey || '';
                this.model = settings.openaiModel || '';
                break;
            case 'claude':
                this.apiKey = settings.claudeApiKey || '';
                this.model = settings.claudeModel || '';
                break;
            case 'ollama':
                this.ollamaUrl = settings.ollamaUrl || 'http://localhost:11434';
                this.model = settings.ollamaModel || '';
                this.apiKey = settings.ollamaApiKey || '';
                break;
        }
    }

    async generate(prompt, systemPrompt = "You are a helpful email assistant.") {
        console.log(`Generating with ${this.provider} (Model: ${this.model || 'default'})...`);
        if (!this.apiKey && this.provider !== 'ollama') {
            throw new Error(`API Key required for ${this.provider}`);
        }

        try {
            switch (this.provider) {
                case 'gemini':
                    return await this._callGemini(prompt, systemPrompt);
                case 'openai':
                    return await this._callOpenAI(prompt, systemPrompt);
                case 'claude':
                    return await this._callClaude(prompt, systemPrompt);
                case 'ollama':
                    return await this._callOllama(prompt, systemPrompt);
                default:
                    throw new Error(`Unknown provider: ${this.provider}`);
            }
        } catch (error) {
            console.error("AI Generation Error:", error);
            throw error;
        }
    }

    async _callGemini(prompt, systemPrompt) {
        const model = this.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        const payload = {
            contents: [{
                parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
            }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    async _callOpenAI(prompt, systemPrompt) {
        const url = 'https://api.openai.com/v1/chat/completions';
        const payload = {
            model: this.model || "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async _callClaude(prompt, systemPrompt) {
        const url = 'https://api.anthropic.com/v1/messages';

        const payload = {
            model: this.model || "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
                { role: "user", content: prompt }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Claude API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    async _callOllama(prompt, systemPrompt) {
        const url = `${this.ollamaUrl}/api/chat`;
        const payload = {
            model: this.model || 'llama3',
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            stream: false
        };

        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Ollama API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        return data.message.content;
    }
}

const aiService = new AIService();
export default aiService;
