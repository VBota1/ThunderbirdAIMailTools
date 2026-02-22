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
            const body = (full.parts ? this._findBody(full.parts) : full.body) || "(No content)";
            context += `From: ${msg.author}\nSubject: ${msg.subject}\nBody: ${body.substring(0, 500)}...\n\n`;
        }

        let prompt = `Please provide a concise summary of these ${processList.length} emails. Group them by topic if possible.\n`;
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
        for (const part of parts) {
            if (part.contentType === 'text/plain' && part.body) return part.body;
            if (part.parts) {
                const found = this._findBody(part.parts);
                if (found) return found;
            }
        }
        return "";
    }
};
