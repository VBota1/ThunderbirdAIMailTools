import aiService from '../utils/ai_service.js';
import { BulkActions } from '../utils/bulk_actions.js';

console.log("AI Sidebar loaded.");

window.addEventListener('error', function (event) {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '10px';
    errorDiv.textContent = 'Error: ' + event.message + ' at ' + event.filename + ':' + event.lineno;
    document.body.prepend(errorDiv);
});

window.addEventListener('unhandledrejection', function (event) {
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '10px';
    errorDiv.textContent = 'Unhandled Promise Rejection: ' + event.reason;
    document.body.prepend(errorDiv);
});

document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const popoutBtn = document.getElementById('popout-btn');

    const promptInput = document.getElementById('prompt-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesDiv = document.getElementById('messages'); // Fixed: messagesDiv was used but not defined in previous snippet implicitly? No, it was.

    // Check if messagesDiv exists, if not, wait.

    const btnSummarize = document.querySelector('button[data-action="summarize"]');
    const btnReply = document.querySelector('button[data-action="reply"]');


    const btnBulkSummarize = document.querySelector('button[data-action="bulk-summarize"]');
    const btnBulkSummarizeUnread = document.querySelector('button[data-action="bulk-summarize-unread"]');
    const btnBulkRead = document.querySelector('button[data-action="bulk-read"]');
    const selectBulkTime = document.getElementById('bulk-time-range');

    const activeProviderSelect = document.getElementById('active-provider-select');

    // Create Task UI
    const btnCreateTask = document.querySelector('button[data-action="create-task"]');
    const taskListSelect = document.getElementById('task-list-select');
    const taskNotes = document.getElementById('task-notes');
    const taskIncludeSummary = document.getElementById('task-include-summary');

    // LoadSettings and Configure Service
    const stored = await browser.storage.local.get([
        'privacyConsent', 'activeProvider', 'geminiApiKey', 'geminiModel', 'openaiApiKey', 'openaiModel',
        'claudeApiKey', 'claudeModel', 'mistralApiKey', 'mistralModel', 'ollamaApiKey', 'ollamaUrl', 'ollamaModel', 'keywords',
        'defaultTaskList'
    ]);

    const privacyOverlay = document.getElementById('privacy-overlay');
    const btnAgreePrivacy = document.getElementById('btn-agree-privacy');

    if (!stored.privacyConsent) {
        privacyOverlay.classList.remove('hidden');
    }

    btnAgreePrivacy.addEventListener('click', async () => {
        await browser.storage.local.set({ privacyConsent: true });
        privacyOverlay.classList.add('hidden');
    });

    let activeProvider = stored.activeProvider || 'gemini';
    if (activeProviderSelect) {
        activeProviderSelect.value = activeProvider;

        activeProviderSelect.addEventListener('change', async (e) => {
            activeProvider = e.target.value;
            await browser.storage.local.set({ activeProvider });
            aiService.configure(activeProvider, stored);
            checkConfig(activeProvider, stored);
        });
    }

    aiService.configure(activeProvider, stored);
    checkConfig(activeProvider, stored);

    // Load Task Lists for dropdown
    try {
        if (browser.calendarTasks) {
            const lists = await browser.calendarTasks.getTaskLists();
            taskListSelect.innerHTML = '<option value="">-- Choose a Task List --</option>';
            lists.forEach(list => {
                const option = document.createElement('option');
                option.value = list.id;
                option.textContent = list.name;
                taskListSelect.appendChild(option);
            });
            if (stored.defaultTaskList) {
                taskListSelect.value = stored.defaultTaskList;
            }
        } else {
            taskListSelect.innerHTML = '<option value="">Tasks API Not Available</option>';
        }
    } catch (e) {
        console.error("Failed to load task lists:", e);
    }

    function checkConfig(provider, settings) {
        let isConfigured = false;
        switch (provider) {
            case 'gemini': isConfigured = !!settings.geminiApiKey; break;
            case 'openai': isConfigured = !!settings.openaiApiKey; break;
            case 'claude': isConfigured = !!settings.claudeApiKey; break;
            case 'mistral': isConfigured = !!settings.mistralApiKey; break;
            case 'ollama': isConfigured = true; break; // URL has default
        }
        if (!isConfigured) {
            addMessage('system', `Please configure the ${provider} provider in Add-on Options.`);
        }
    }

    // Configure Service


    // Check if we are in a popup or standalone window to hide/show popout button
    browser.windows.getCurrent().then(win => {
        if (win.type === 'popup') {
            popoutBtn.style.display = 'none'; // Already popped out
        }
    });

    popoutBtn.addEventListener('click', () => {
        browser.windows.create({
            url: browser.runtime.getURL("popup/index.html"),
            type: "popup",
            width: 800,
            height: 800
        });
        window.close(); // Close the popup
    });



    sendBtn.addEventListener('click', async () => {
        const text = promptInput.value.trim();
        if (!text) return;
        addMessage('user', text);
        promptInput.value = '';
        await processAIRequest(text);
    });

    btnSummarize.addEventListener('click', async () => {
        const message = await getDisplayedMessage();
        if (!message) return addMessage('system', 'No message selected.');

        const fullMessage = await browser.messages.getFull(message.id);
        // Extract plain text body (simplified)
        let body = fullMessage.parts ? findBody(fullMessage.parts) : fullMessage.body;
        if (!body) body = "(No content found)";

        addMessage('user', 'Summarize this email.');
        // We pass the email content as context
        const { keywords } = await browser.storage.local.get('keywords');
        let prompt = `Please summarize this email from ${message.author}:\n`;
        if (keywords && keywords.trim() !== "") {
            prompt += `\nPay special attention and explicitly mention if any of the following keywords are discussed: ${keywords}\n`;
        }
        prompt += `\n${body.substring(0, 5000)}`;

        await processAIRequest(prompt);
    });

    btnReply.addEventListener('click', async () => {
        const message = await getDisplayedMessage();
        if (!message) return addMessage('system', 'No message selected.');

        const fullMessage = await browser.messages.getFull(message.id);
        let body = fullMessage.parts ? findBody(fullMessage.parts) : fullMessage.body;

        addMessage('user', 'Draft a reply.');
        const msgId = addMessage('ai', 'Drafting reply...'); // Show status

        try {
            let prompt = `Draft a polite reply to this email from ${message.author}.`;
            const instructions = document.getElementById('reply-instructions')?.value.trim();
            if (instructions) {
                prompt += ` Please follow these specific instructions for the reply: ${instructions}`;
            }
            prompt += `\n\nThe email content is:\n\n${body.substring(0, 5000)}`;

            const response = await aiService.generate(prompt);

            if (response) {
                await browser.compose.beginReply(message.id, 'replyToSender', { body: response });
                updateMessage(msgId, 'Reply opened in compose window.');
            } else {
                updateMessage(msgId, 'Failed to generate reply.');
            }
        } catch (e) {
            updateMessage(msgId, 'Error: ' + e.message);
        }
    });



    btnCreateTask.addEventListener('click', async () => {
        const message = await getDisplayedMessage();
        if (!message) return addMessage('system', 'No message selected to create a task from.');

        const listId = taskListSelect.value;
        if (!listId) return addMessage('system', 'Please select a task list first.');

        const fullMessage = await browser.messages.getFull(message.id);
        let body = fullMessage.parts ? findBody(fullMessage.parts) : fullMessage.body;

        addMessage('user', 'Create a task from this email.');
        const msgId = addMessage('ai', 'Creating task...');

        try {
            let finalNotes = taskNotes.value.trim();

            if (taskIncludeSummary.checked) {
                updateMessage(msgId, 'Generating AI summary for task notes...');
                const { keywords } = await browser.storage.local.get('keywords');
                let prompt = `Please summarize this email from ${message.author}:\n`;
                if (keywords && keywords.trim() !== "") {
                    prompt += `\nPay special attention to these keywords: ${keywords}\n`;
                }
                prompt += `\n${body.substring(0, 5000)}`;

                const summary = await aiService.generate(prompt);

                if (finalNotes) {
                    finalNotes += "\n\n--- AI Summary ---\n" + summary;
                } else {
                    finalNotes = "--- AI Summary ---\n" + summary;
                }
            }

            finalNotes += `\n\nOriginal Subject: ${message.subject}`;
            finalNotes += `\nFrom: ${message.author}`;

            let dueDateStr = null;
            if (message.date) {
                // message.date is usually a Date object or timestamp
                const dateObj = new Date(message.date);
                if (!isNaN(dateObj.getTime())) {
                    dueDateStr = dateObj.toISOString();
                    // Add the human-readable date to the notes
                    finalNotes += `\nReceived: ${dateObj.toLocaleString()}`;
                }
            }

            const taskTitle = message.subject ? `Email: ${message.subject}` : 'Email Task';

            updateMessage(msgId, 'Saving task to Thunderbird...');
            await browser.calendarTasks.createTask(listId, taskTitle, dueDateStr, finalNotes);

            updateMessage(msgId, '✅ Task successfully created!');
            taskNotes.value = '';
            taskIncludeSummary.checked = false;
        } catch (e) {
            console.error(e);
            updateMessage(msgId, '❌ Failed to create task: ' + e.message);
        }
    });

    // Bulk Actions
    btnBulkSummarize.addEventListener('click', async () => {
        addMessage('system', 'Starting bulk summarization...');
        const range = getRangeFromSelect(selectBulkTime.value);
        const folder = await getCurrentFolder();
        if (!folder) return addMessage('system', 'Cannot detect current folder.');

        const messages = await BulkActions.getMessagesInTimeRange(folder, range.start, range.end);
        if (messages.length === 0) return addMessage('system', 'No messages found in range.');

        addMessage('system', `Found ${messages.length} messages. Summarizing...`);
        const { keywords } = await browser.storage.local.get('keywords');
        const summary = await BulkActions.summarizeMessages(messages, keywords);
        addMessage('ai', summary);
    });

    btnBulkSummarizeUnread.addEventListener('click', async () => {
        addMessage('system', 'Starting bulk summarization of unread messages...');
        const range = getRangeFromSelect(selectBulkTime.value);
        const folder = await getCurrentFolder();
        if (!folder) return addMessage('system', 'Cannot detect current folder.');

        const messages = await BulkActions.getMessagesInTimeRange(folder, range.start, range.end, true);
        if (messages.length === 0) return addMessage('system', 'No unread messages found in range.');

        addMessage('system', `Found ${messages.length} unread messages. Summarizing...`);
        const { keywords } = await browser.storage.local.get('keywords');
        const summary = await BulkActions.summarizeMessages(messages, keywords);
        addMessage('ai', summary);
    });

    btnBulkRead.addEventListener('click', async () => {
        addMessage('system', 'Marking messages as read...');
        const range = getRangeFromSelect(selectBulkTime.value);
        const folder = await getCurrentFolder();
        if (!folder) return addMessage('system', 'Cannot detect current folder.');

        const messages = await BulkActions.getMessagesInTimeRange(folder, range.start, range.end, true);
        if (messages.length === 0) return addMessage('system', 'No unread messages found in range.');

        const count = await BulkActions.markMessagesRead(messages);
        addMessage('system', `Marked ${count} messages as read.`);
    });

    function getRangeFromSelect(value) {
        const now = new Date();
        const start = new Date();
        let end = now;

        if (value === 'yesterday') {
            // Yesterday: Start of yesterday to end of yesterday
            start.setDate(now.getDate() - 1);
            start.setHours(0, 0, 0, 0);

            end = new Date(start);
            end.setHours(23, 59, 59, 999);
            return { start, end };
        }

        if (value === '24h') start.setHours(now.getHours() - 24);
        if (value === '48h') start.setHours(now.getHours() - 48);
        if (value === '7d') start.setDate(now.getDate() - 7);

        return { start, end };
    }

    async function getActiveMailTab() {
        let tabs = [];
        try {
            const win = await browser.windows.getCurrent();
            if (win.type === 'popup' || win.type === 'panel') {
                // We are in a detached window, find the main mail window or a message window
                const allWins = await browser.windows.getAll({ populate: true });

                // Prioritize message windows (dedicated email tabs) over the main window
                const messageWins = allWins.filter(w => w.type === 'messageDisplay');
                if (messageWins.length > 0) {
                    tabs = await browser.tabs.query({ active: true, windowId: messageWins[0].id });
                } else {
                    const normalWins = allWins.filter(w => w.type === 'normal');
                    if (normalWins.length > 0) {
                        tabs = await browser.tabs.query({ active: true, windowId: normalWins[0].id });
                    }
                }
            } else {
                // We are in the main window (or browser_action popup usually inherits context? 
                // Actually browser_action popup `currentWindow` is the main window)
                tabs = await browser.tabs.query({ active: true, currentWindow: true });
            }
        } catch (e) {
            console.error("Error finding mail tab:", e);
        }
        return tabs.length > 0 ? tabs[0] : null;
    }

    async function getCurrentFolder() {
        // 1. Try currently selected message
        const message = await getDisplayedMessage();
        if (message) {
            if (message.folder) {
                return message.folder;
            }
            // Fallback: fetch full message
            try {
                const fullMsg = await browser.messages.get(message.id);
                if (fullMsg && fullMsg.folder) {
                    return fullMsg.folder;
                }
            } catch (e) {
                console.error("Error fetching full message:", e);
            }
        }

        // 2. Try getting the folder from the 'active' tab state
        try {
            const tabs = await browser.mailTabs.query({ active: true, currentWindow: true });
            if (tabs && tabs.length > 0) {
                const mailTab = tabs[0];
                if (mailTab.displayedFolder) {
                    return mailTab.displayedFolder;
                }
            }
        } catch (e) {
            console.log("Error accessing mailTabs:", e);
        }

        return null;
    }



    async function processAIRequest(prompt, returnText = false) {
        const msgId = addMessage('ai', 'Thinking...');
        try {
            const response = await aiService.generate(prompt);
            updateMessage(msgId, response);
            return response;
        } catch (err) {
            updateMessage(msgId, `Error: ${err.message}`);
            return null;
        }
    }

    // Helpers
    function addMessage(type, text) {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        if (type === 'ai') {
            safeSetHTML(div, formatMessage(text));
        } else {
            div.textContent = text;
        }
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return div; // Return element to update if needed
    }

    function updateMessage(element, text) {
        // AI messages are always formatted
        safeSetHTML(element, formatMessage(text));
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function safeSetHTML(element, htmlString) {
        // Use DOMParser to safely parse the HTML string
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        // Clear existing content
        element.textContent = '';

        // Safely append only the nodes we generated (text, strong, em, br, ul, li)
        // Since we already escaped < and > in formatMessage before adding strong/em tags,
        // the parsed doc will only contain the safe tags we explicitly added.
        while (doc.body.firstChild) {
            element.appendChild(doc.body.firstChild);
        }
    }

    function formatMessage(text) {
        if (!text) return '';

        // Escape HTML first to prevent XSS from raw text, 
        // BUT we are generating HTML so we need to be careful.
        // For a simple local tool, we might skip full sanitization if we trust the AI output,
        // but it's better to escape basic chars except our tags.
        // However, standard markdown parsers are complex. 
        // Let's do a simple replacement for the requested features: **bold**, *italic*, - lists.

        let formatted = text
            // Escape HTML characters (basic)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            // Bold (**text**)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic (*text*)
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Unordered Lists (lines starting with * or -)
            .replace(/^\s*[\-\*]\s+(.*)$/gm, '<li>$1</li>')
            // Newlines to <br> or wrap in <p>
            .replace(/\n/g, '<br>');

        // Wrap lists in <ul> (simple heuristic: sequence of <li>)
        // This regex approach is a bit fragile for complex nested lists but works for simple ones.
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        // The above regex only wraps the FIRST list it sees and treats it as one block? 
        // Actually, replacing all <li>...</li> sequences with <ul>...</ul> is harder with simple regex.
        // Let's try a slightly better approach:
        // formatting <li> items, then checking if we have them.

        // Better list handling:
        // If we see multiple <li>s, we want to wrap them. 
        // Since we already replaced lines with <li>, properly nested ULs are hard.
        // Let's just allow <li> to exist and style them decently even without <ul> if necessary,
        // or just use <br> for newlines.

        return formatted;
    }

    async function getDisplayedMessage() {
        // 1. First, try the most direct contextual approach
        try {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                const tabId = tabs[0].id;

                // Try message display first (for popped out windows)
                try {
                    const displayed = await browser.messageDisplay.getDisplayedMessage(tabId);
                    if (displayed) return displayed;
                } catch (e) { }

                // Try selected messages next (for main window)
                try {
                    const selected = await browser.mailTabs.getSelectedMessages(tabId);
                    if (selected && selected.messages && selected.messages.length > 0) {
                        return selected.messages[0];
                    }
                } catch (e) { }
            }
        } catch (e) {
            console.log("Error querying current window tabs:", e);
        }

        // 2. If that fails (e.g., popup has its own window context), search all tabs globally
        try {
            const allTabs = await browser.tabs.query({});
            // Sort to prioritize active tabs
            allTabs.sort((a, b) => (b.active === a.active) ? 0 : b.active ? 1 : -1);

            for (const tab of allTabs) {
                // Skip the popup's own tab if possible
                if (tab.url && tab.url.includes('popup/index.html')) continue;

                try {
                    const displayed = await browser.messageDisplay.getDisplayedMessage(tab.id);
                    if (displayed) return displayed;
                } catch (e) { }

                try {
                    const selected = await browser.mailTabs.getSelectedMessages(tab.id);
                    if (selected && selected.messages && selected.messages.length > 0) {
                        return selected.messages[0];
                    }
                } catch (e) { }
            }
        } catch (e) {
            console.error("Error finding message via global tabs:", e);
        }

        return null;
    }

    function findBody(parts) {
        // Recursive find text/plain
        for (const part of parts) {
            if (part.contentType === 'text/plain' && part.body) return part.body;
            if (part.parts) {
                const found = findBody(part.parts);
                if (found) return found;
            }
        }
        return "";
    }
});
