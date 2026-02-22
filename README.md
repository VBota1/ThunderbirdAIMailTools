# AI Mail Tool

AI Mail Tool is a Thunderbird plugin that enables AI access to e-mails and calendar management inside Thunderbird.

## Features
- **AI Chat Integrations**: Chat with Google Gemini, OpenAI, Claude, or Ollama directly in the sidebar.
- **Sidebar Access**: Convenient sidebar panel for quick access.
- **Email Summarization**: Summarize single emails or bulk summarize recent messages.
- **Reply Drafting**: Generate AI drafts for replies directly in the compose window.
- **Bulk Actions**: Mark messages as read in bulk.

## Configuration
Go to the **Add-ons Manager**, select **AI Mail Tool**, click the **Preferences** (wrench) icon, and configure your AI provider and API key.

## Installation

### Temporary (Testing)
1. Go to **Tools > Developer Tools > Debug Add-ons**.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json`.

### Permanent Installation
To install the add-on permanently:

1. **Package the Extension**:
   - Select all files in the root directory (`manifest.json`, `popup/`, `utils/`, `icons/`, etc.).
   - Create a ZIP archive of these files.
   - Rename the `.zip` file to `.xpi` (e.g., `ai-mail-tool.xpi`).

2. **Install in Thunderbird**:
   - Go to **Tools > Add-ons and Themes**.
   - Click the gear icon ⚙️ and select **Install Add-on From File...**.
   - Select your `.xpi` file.
   - Click **Add**.

## Development
- `manifest.json`: Configuration and permissions.
- `popup/`: Sidebar UI logic.
- `utils/`: shared utilities for AI and bulk actions.
- `options/`: Settings page logic.