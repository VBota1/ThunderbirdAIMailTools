import aiService from './ai_service.js';

export const BulkActions = {
    async getMessagesInTimeRange(folder, startTime, endTime, onlyUnread = false) {
        let messages = [];
        let queryInfo = {
            fromDate: startTime,
            toDate: endTime
        };

        if (onlyUnread) {
            queryInfo.read = false;
        }

        try {
            let page = await browser.messages.query(queryInfo);
            while (page.messages.length > 0) {
                for (const msg of page.messages) {
                    // Manually filter by folder since 'folder' property is strictly typed or deprecated in MV3 queryInfo
                    if (folder && msg.folder && msg.folder.accountId === folder.accountId && msg.folder.path === folder.path) {
                        messages.push(msg);
                    }
                }
                if (page.id) {
                    page = await browser.messages.continueList(page.id);
                } else {
                    break;
                }
            }
        } catch (e) {
            console.error("Query failed:", e);
            throw e;
        }
        return messages;
    },

    async summarizeMessages(messages, keywords = "") {
        if (messages.length === 0) return "No messages to summarize.";

        // Limit to avoid context window explosion
        const maxMessages = 20;
        const processList = messages.slice(0, maxMessages);

        let context = "Here are the emails:\n";
        for (const msg of processList) {
            const full = await browser.messages.getFull(msg.id);
            let body = this._findBody([full]);
            if (!body || body.trim() === "") {
                try {
                    const rawInfo = await browser.messages.getRaw(msg.id);
                    let rawString = rawInfo;
                    if (rawInfo && typeof rawInfo.text === 'function') {
                        rawString = await rawInfo.text();
                    } else if (typeof rawInfo !== 'string') {
                        rawString = String(rawInfo);
                    }
                    const parts = rawString.split(/\r?\n\r?\n/);
                    if (parts.length > 1) {
                        parts.shift();
                        body = parts.join('\n\n');
                        body = this._extractTextFromHtml(body);
                    } else {
                        body = rawString;
                    }
                } catch (e) {
                    console.error("Failed to fetch raw message in bulk", e);
                }
            }
            if (!body || body.trim() === "") body = "(No content)";
            context += `From: ${msg.author}\nSubject: ${msg.subject}\nBody: ${body.substring(0, 500)}...\n\n`;
        }

        let prompt = `Please provide a concise summary of these ${processList.length} emails. Group them by topic if possible.\n`;
        prompt += `IMPORTANT: For each summary point or topic group, you MUST explicitly mention the original email Subject(s) it refers to, so the user knows exactly which emails to look for.\n`;
        prompt += `Also, please ensure that no email from the list provided is omitted from the summary.\n`;

        if (keywords && keywords.trim() !== "") {
            prompt += `\nPay special attention and explicitly mention if any of the following keywords are discussed: ${keywords}\n`;
        }
        prompt += `\n${context}`;

        return await aiService.generate(prompt);
    },

    async markMessagesRead(messages) {
        let count = 0;
        for (const msg of messages) {
            if (!msg.read) {
                await browser.messages.update(msg.id, { read: true });
                count++;
            }
        }
        return count;
    },

    _findBody(parts) {
        let textBody = "";
        let htmlBody = "";

        const searchParts = (pts) => {
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
        };

        searchParts(parts);

        const cleanText = textBody ? textBody.trim() : "";
        let finalHtmlText = "";
        if (htmlBody) {
            finalHtmlText = this._extractTextFromHtml(htmlBody).trim();
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
    },

    _extractTextFromHtml(html) {
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
};
