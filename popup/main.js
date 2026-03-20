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
        // Extract plain text body
        let body = findBody([fullMessage]);

        if (!body || body.trim() === "") {
            try {
                const rawInfo = await browser.messages.getRaw(message.id);
                let rawString = rawInfo;
                if (rawInfo && typeof rawInfo.text === 'function') {
                    rawString = await rawInfo.text();
                } else if (typeof rawInfo !== 'string') {
                    rawString = String(rawInfo);
                }
                // Raw info usually contains headers + body in raw MIME
                // Let's do a rudimentary extraction pulling everything after the first double-newline
                const parts = rawString.split(/\r?\n\r?\n/);
                if (parts.length > 1) {
                    // Shift off the headers, join the rest
                    parts.shift();
                    body = parts.join('\n\n');
                    body = extractTextFromHtml(body); // Strip any HTML tags from raw payload
                } else {
                    body = rawString;
                }
            } catch (e) {
                console.error("Failed to fetch raw message", e);
            }
        }

        if (!body || body.trim() === "") body = "(No content found - Parser empty)";

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
        let body = findBody([fullMessage]);

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
        let body = findBody([fullMessage]);

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

        const batchCount = Math.ceil(messages.length / BulkActions.bulkSummaryBatchSize);
        addMessage('system', `Found ${messages.length} messages. Summarizing all of them in ${batchCount} batch${batchCount === 1 ? '' : 'es'}...`);
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

        const batchCount = Math.ceil(messages.length / BulkActions.bulkSummaryBatchSize);
        addMessage('system', `Found ${messages.length} unread messages. Summarizing all of them in ${batchCount} batch${batchCount === 1 ? '' : 'es'}...`);
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

        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        return formatted;
    }

    async function getDisplayedMessage() {
        try {
            // Get all active tabs across all windows
            const allTabs = await browser.tabs.query({ active: true });

            // Filter out the popup's own tab
            const validTabs = allTabs.filter(t => !t.url || !t.url.includes('popup/index.html'));

            // Since `tabs.query` does not guarantee a last-focused order, and since 
            // Thunderbird normal windows can hold both message tabs and inbox tabs,
            // we will simply try to get a DISPLAED message from ALL active tabs first.
            // A fully displayed message (whether in a dedicated window or a dedicated tab)
            // represents a higher intent than a selected message in an inbox view.

            for (const tab of validTabs) {
                try {
                    const displayed = await browser.messageDisplay.getDisplayedMessages(tab.id);
                    if (displayed && displayed.messages && displayed.messages.length > 0) {
                        return displayed.messages[0];
                    }
                } catch (e) { }
            }

            // If NO active tab has a message actually displayed, we fall back to checking
            // if any active tab has a message selected (e.g., highlighted in the Inbox).
            // We search in reverse order of windowId assuming newer windows (higher IDs)
            // are more likely to be the one the user spawned recently, though this is a generic fallback.
            validTabs.sort((a, b) => b.windowId - a.windowId);

            for (const tab of validTabs) {
                try {
                    const selected = await browser.mailTabs.getSelectedMessages(tab.id);
                    if (selected && selected.messages && selected.messages.length > 0) {
                        return selected.messages[0];
                    }
                } catch (e) { }
            }

        } catch (e) {
            console.error("Error finding active message:", e);
        }

        return null;
    }

    function findBody(parts) {
        let textBody = "";
        let htmlBody = "";

        function searchParts(pts) {
            if (!pts) return;
            for (const part of pts) {
                const cType = (part.contentType || '').toLowerCase();
                if (cType.includes('text/plain') && part.body) {
                    if (part.body.length > textBody.length) textBody = part.body;
                }
                if (cType.includes('text/html') && part.body) {
                    if (part.body.length > htmlBody.length) htmlBody = part.body;
                }
                if (part.parts) {
                    searchParts(part.parts);
                }
            }
        }

        searchParts(parts);

        const cleanText = textBody ? textBody.trim() : "";
        let finalHtmlText = "";
        if (htmlBody) {
            finalHtmlText = extractTextFromHtml(htmlBody).trim();
        }

        let bestText = "";
        if (finalHtmlText.length > cleanText.length) {
            bestText = finalHtmlText;
        } else {
            bestText = cleanText || finalHtmlText;
        }

        if (!bestText) {
            bestText = textBody || htmlBody || "";
        }

        return bestText;
    }

    function extractTextFromHtml(html) {
        if (typeof DOMParser !== 'undefined') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const toRemove = doc.querySelectorAll('script, style');
            for (const el of toRemove) el.remove();

            const blocks = doc.querySelectorAll('p, div, br, h1, h2, h3, h4, h5, h6, li');
            for (const el of blocks) {
                if (el.tagName.toLowerCase() === 'br') {
                    el.replaceWith('\n');
                } else {
                    el.appendChild(doc.createTextNode('\n'));
                }
            }
            return doc.body.textContent || doc.body.innerText || "";
        } else {
            let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            text = text.replace(/<\/(div|p|h[1-6]|li|tr)>/gi, '\n');
            text = text.replace(/<br\s*[\/]?>/gi, '\n');
            text = text.replace(/<[^>]+>/g, '');
            return text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        }
    }
});
