import { UNITS, BUILTIN_PRESETS, makeToken, parseToken, formatToken } from './utils/time_range.js';

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

    // Bulk time-range elements
    const presetsList = document.getElementById('custom-presets-list');
    const addPresetBtn = document.getElementById('add-preset-btn');
    const defaultRangeSelect = document.getElementById('default-range');

    // Load stored settings
    const stored = await browser.storage.local.get([
        ...Object.keys(inputs), 'bulkCustomPresets', 'bulkDefaultRange'
    ]);

    for (const [key, element] of Object.entries(inputs)) {
        if (stored[key] !== undefined) {
            element.value = stored[key];
        }
    }

    // --- Bulk time-range presets ---

    function createUnitSelect(selectedUnit) {
        const sel = document.createElement('select');
        for (const [key, info] of Object.entries(UNITS)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = info.label;
            sel.appendChild(opt);
        }
        sel.value = UNITS[selectedUnit] ? selectedUnit : 'd';
        return sel;
    }

    function addPresetRow(token) {
        const parsed = parseToken(token) || { amount: 1, unit: 'd' };

        const row = document.createElement('div');
        row.className = 'preset-row';

        const amount = document.createElement('input');
        amount.type = 'number';
        amount.min = '1';
        amount.step = '1';
        amount.value = parsed.amount;

        const unit = createUnitSelect(parsed.unit);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove this range';
        removeBtn.addEventListener('click', () => {
            row.remove();
            rebuildDefaultSelect();
        });

        amount.addEventListener('input', rebuildDefaultSelect);
        unit.addEventListener('change', rebuildDefaultSelect);

        row.appendChild(amount);
        row.appendChild(unit);
        row.appendChild(removeBtn);
        presetsList.appendChild(row);
    }

    // Read valid, de-duplicated tokens from the preset rows.
    function collectPresets() {
        const tokens = [];
        presetsList.querySelectorAll('.preset-row').forEach(row => {
            const amount = row.querySelector('input').value;
            const unit = row.querySelector('select').value;
            const token = makeToken(amount, unit);
            if (token && !tokens.includes(token)) tokens.push(token);
        });
        return tokens;
    }

    // Rebuild the default-range dropdown from built-ins + current custom presets,
    // preserving the current selection where possible.
    function rebuildDefaultSelect() {
        const previous = defaultRangeSelect.value;
        const tokens = [];
        for (const t of [...BUILTIN_PRESETS, ...collectPresets()]) {
            if (!tokens.includes(t)) tokens.push(t);
        }

        defaultRangeSelect.innerHTML = '';
        tokens.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = formatToken(t);
            defaultRangeSelect.appendChild(opt);
        });

        if (tokens.includes(previous)) {
            defaultRangeSelect.value = previous;
        }
    }

    // Populate preset rows from storage.
    const savedPresets = Array.isArray(stored.bulkCustomPresets) ? stored.bulkCustomPresets : [];
    savedPresets.forEach(addPresetRow);

    addPresetBtn.addEventListener('click', () => {
        addPresetRow('1d');
        rebuildDefaultSelect();
    });

    rebuildDefaultSelect();
    if (stored.bulkDefaultRange &&
        [...defaultRangeSelect.options].some(o => o.value === stored.bulkDefaultRange)) {
        defaultRangeSelect.value = stored.bulkDefaultRange;
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

        toSave.bulkCustomPresets = collectPresets();
        toSave.bulkDefaultRange = defaultRangeSelect.value;

        await browser.storage.local.set(toSave);

        statusMsg.style.display = 'block';
        setTimeout(() => {
            statusMsg.style.display = 'none';
        }, 2000);
    });
});
