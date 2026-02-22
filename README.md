# AI Mail Tool for Thunderbird

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI Mail Tool is a modern, Manifest V3-compliant Thunderbird extension that brings powerful AI capabilities directly to your inbox. Designed with privacy and productivity in mind, it allows you to summarize emails, draft contextual replies, create calendar tasks from message data, and manage your inbox in bulk using your preferred AI language models.

## ✨ Features

- **Multi-Provider Support**: Connects to Google Gemini, OpenAI, Anthropic Claude, or use 100% local, offline processing via Ollama.
- **Smart Summarization**: Quickly grasp the context of long emails or threads with AI summaries that highlight key points. Keyword tracking ensures you never miss specific topics.
- **Contextual Draft Replies**: Generate polite, context-aware drafts directly into the Thunderbird compose window based on custom instructions (e.g., "accept the meeting but suggest 3 PM").
- **Task Creation**: Seamlessly extract emails into Thunderbird Calendar Tasks (calITodo items). Includes the AI summary, original subject, and received date right in the task notes.
- **Bulk Actions**: Process your inbox efficiently by summarizing all unread messages from the last 24, 48, or 72 hours, or marking bulk items as read.
- **Privacy First**: Explicit, unmissable consent screen. No telemetry or analytics are collected, and data is only transmitted when you explicitly interact with the AI tools. 

## ⚙️ Configuration & Setup

Before using the tool, you must configure your preferred AI provider:

1. Go to the **Add-ons and Themes** manager in Thunderbird.
2. Find **AI Mail Tool** and click the **Preferences** 🔧 (wrench) icon.
3. Enter your API Key for your chosen provider (OpenAI, Gemini, or Claude).
4. If using **Ollama**, ensure your local instance is running (default: `http://localhost:11434`) and enter the model name you have pulled (e.g., `llama3` or `mistral`).
5. Set your **Default Task List** in the options dropdown if you plan to use the "Create Task from Email" feature.

## 📥 Installation

### Permanent Installation

1. **Download or Package the Extension**:
   - Download the latest `.xpi` release file, OR
   - Select all files in the root directory (`manifest.json`, `popup/`, `utils/`, etc.), zip them, and rename the file extension to `.xpi`.
2. **Install in Thunderbird**:
   - Navigate to **Tools > Add-ons and Themes**.
   - Click the gear icon ⚙️ in the top right and select **Install Add-on From File...**.
   - Select your `.xpi` file and click **Add**.

### Temporary (Development)
1. Go to **Tools > Developer Tools > Debug Add-ons**.
2. Click **Load Temporary Add-on**.
3. Select the `manifest.json` file from the project directory.

## 🛠️ Technical Details
- **Architecture**: Thunderbird WebExtension (Manifest V3)
- **Permissions**: Requires restricted `host_permissions` for AI API endpoints, alongside Thunderbird-specific accounts, messages, and compose permissions.
- **Experiment APIs**: Uses an experimental `calendarTasks` API script to bypass legacy limitations and natively create `calITodo` components inside Thunderbird's local calendar database.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.