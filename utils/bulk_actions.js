import aiService from './ai_service.js';

export const BulkActions = {
    bulkSummaryBatchSize: 10,
    bulkSummaryBodyLimit: 500,

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

        const preparedMessages = [];
        for (const msg of messages) {
            preparedMessages.push(await this._prepareMessageForSummary(msg));
        }

        const batches = this._chunkMessages(preparedMessages, this.bulkSummaryBatchSize);
        const batchSummaries = [];

        for (let index = 0; index < batches.length; index++) {
            const batch = batches[index];
            const prompt = this._buildBatchSummaryPrompt(batch, keywords, {
                batchIndex: index + 1,
                totalBatches: batches.length,
                totalMessages: preparedMessages.length
            });

            const summary = await aiService.generate(
                prompt,
                "You are a careful email assistant. Summarize every email provided and do not omit any subject."
            );

            batchSummaries.push({
                batchIndex: index + 1,
                messageCount: batch.length,
                subjects: batch.map(msg => msg.subject),
                summary: summary.trim()
            });
        }

        if (batchSummaries.length === 1) {
            return batchSummaries[0].summary;
        }

        try {
            const finalPrompt = this._buildFinalSummaryPrompt(batchSummaries, preparedMessages.length, keywords);
            return await aiService.generate(
                finalPrompt,
                "You are a careful email assistant. Merge batch summaries into one final summary while preserving coverage of every email subject."
            );
        } catch (e) {
            console.error("Failed to synthesize final bulk summary", e);
            return this._formatBatchSummaryFallback(batchSummaries, preparedMessages.length);
        }
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

    async _prepareMessageForSummary(msg) {
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

        if (!body || body.trim() === "") {
            body = "(No content)";
        }

        return {
            author: msg.author || "(Unknown sender)",
            subject: msg.subject || "(No subject)",
            body: body.substring(0, this.bulkSummaryBodyLimit)
        };
    },

    _chunkMessages(messages, chunkSize) {
        const chunks = [];
        for (let index = 0; index < messages.length; index += chunkSize) {
            chunks.push(messages.slice(index, index + chunkSize));
        }
        return chunks;
    },

    _buildBatchSummaryPrompt(batch, keywords, meta) {
        let prompt = `Please provide a concise summary of these ${batch.length} emails from batch ${meta.batchIndex} of ${meta.totalBatches}. `;
        prompt += `These emails are part of a larger set of ${meta.totalMessages} emails, so every email in this batch must be covered.\n`;
        prompt += `IMPORTANT: For each summary point or topic group, explicitly mention the original email Subject(s) it refers to.\n`;
        prompt += `Do not omit any email in this batch.\n`;

        if (keywords && keywords.trim() !== "") {
            prompt += `\nPay special attention and explicitly mention if any of the following keywords are discussed: ${keywords}\n`;
        }

        prompt += "\nHere are the emails:\n";
        for (const msg of batch) {
            prompt += `From: ${msg.author}\nSubject: ${msg.subject}\nBody: ${msg.body}...\n\n`;
        }

        return prompt;
    },

    _buildFinalSummaryPrompt(batchSummaries, totalMessages, keywords) {
        let prompt = `You are combining partial summaries for ${totalMessages} emails into one final response.\n`;
        prompt += `Produce a concise final summary grouped by topic where possible.\n`;
        prompt += `IMPORTANT: Every email must still be represented, and every bullet or topic group must explicitly mention the relevant original Subject(s).\n`;
        prompt += `Do not say that only part of the mailbox was summarized.\n`;

        if (keywords && keywords.trim() !== "") {
            prompt += `\nPay special attention and explicitly mention if any of the following keywords are discussed: ${keywords}\n`;
        }

        prompt += "\nBatch summaries:\n\n";
        for (const batch of batchSummaries) {
            prompt += `Batch ${batch.batchIndex} (${batch.messageCount} emails)\n`;
            prompt += `Subjects: ${batch.subjects.join(' | ')}\n`;
            prompt += `${batch.summary}\n\n`;
        }

        return prompt;
    },

    _formatBatchSummaryFallback(batchSummaries, totalMessages) {
        let output = `Here is a concise summary of the ${totalMessages} emails, grouped by batch:\n\n`;
        for (const batch of batchSummaries) {
            output += `Batch ${batch.batchIndex} (${batch.messageCount} emails)\n`;
            output += `Subjects: ${batch.subjects.join(' | ')}\n`;
            output += `${batch.summary}\n\n`;
        }
        return output.trim();
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
