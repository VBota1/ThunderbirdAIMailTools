document.addEventListener('DOMContentLoaded', async () => {
    const inputs = {
        geminiApiKey: document.getElementById('gemini-apikey'),
        geminiModel: document.getElementById('gemini-model'),
        openaiApiKey: document.getElementById('openai-apikey'),
        openaiModel: document.getElementById('openai-model'),
        claudeApiKey: document.getElementById('claude-apikey'),
        claudeModel: document.getElementById('claude-model'),
        mistralApiKey: document.getElementById('mistral-apikey'),
        mistralModel: document.getElementById('mistral-model'),
        ollamaApiKey: document.getElementById('ollama-apikey'),
        ollamaUrl: document.getElementById('ollama-url'),
        ollamaModel: document.getElementById('ollama-model'),
        keywords: document.getElementById('keywords-input'),
        defaultTaskList: document.getElementById('default-task-list')
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

    // Load Task Lists
    try {
        if (browser.calendarTasks) {
            const lists = await browser.calendarTasks.getTaskLists();
            const listSelect = inputs.defaultTaskList;
            listSelect.innerHTML = '<option value="">-- Choose a Task List --</option>';

            lists.forEach(list => {
                const option = document.createElement('option');
                option.value = list.id;
                option.textContent = list.name;
                listSelect.appendChild(option);
            });

            // Re-apply stored value after populating
            if (stored.defaultTaskList) {
                listSelect.value = stored.defaultTaskList;
            }
        } else {
            inputs.defaultTaskList.innerHTML = '<option value="">Tasks API Not Available</option>';
        }
    } catch (e) {
        console.error("Failed to load task lists:", e);
        inputs.defaultTaskList.innerHTML = '<option value="">Error loading lists</option>';
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
