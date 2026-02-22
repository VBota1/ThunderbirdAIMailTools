document.addEventListener('DOMContentLoaded', async () => {
    const inputs = {
        geminiApiKey: document.getElementById('gemini-apikey'),
        geminiModel: document.getElementById('gemini-model'),
        openaiApiKey: document.getElementById('openai-apikey'),
        openaiModel: document.getElementById('openai-model'),
        claudeApiKey: document.getElementById('claude-apikey'),
        claudeModel: document.getElementById('claude-model'),
        ollamaApiKey: document.getElementById('ollama-apikey'),
        ollamaUrl: document.getElementById('ollama-url'),
        ollamaModel: document.getElementById('ollama-model'),
        keywords: document.getElementById('keywords-input')
    };

    const saveBtn = document.getElementById('save-btn');
    const statusMsg = document.getElementById('status-msg');

    // Load stored settings
    const stored = await browser.storage.local.get(Object.keys(inputs));

    for (const [key, element] of Object.entries(inputs)) {
        if (stored[key] !== undefined) {
            element.value = stored[key];
        }
    }

    saveBtn.addEventListener('click', async () => {
        const toSave = {};
        for (const [key, element] of Object.entries(inputs)) {
            toSave[key] = element.value;
        }

        await browser.storage.local.set(toSave);

        statusMsg.style.display = 'block';
        setTimeout(() => {
            statusMsg.style.display = 'none';
        }, 2000);
    });
});
