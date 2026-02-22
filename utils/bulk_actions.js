import aiService from './ai_service.js';

export const BulkActions = {
    async getMessagesInTimeRange(folder, startTime, endTime, onlyUnread = false) {
        let messages = [];
        let page = await browser.messages.list(folder);
        while (page.messages.length > 0) {
            for (const msg of page.messages) {
                // msg.date is in microseconds in some versions, or milliseconds? 
                // MDN says `date` is Date object in some contexts, but in `MessageHeader` it's usually Date object or timestamp.
                // Let's assume Date object or timestamp.
                const msgDate = new Date(msg.date);
                if (msgDate >= startTime && msgDate <= endTime) {
                    if (!onlyUnread || !msg.read) {
                        messages.push(msg);
                    }
                }
                // Optimization: if msgDate is older than startTime, and we assume order... can we stop?
                // Mail folders aren't always strictly ordered by date in the API return, so better safe than sorry.
            }
            if (page.id) {
                page = await browser.messages.continueList(page.id);
            } else {
                break;
            }
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
