import { App, PluginSettingTab, Setting } from 'obsidian';
import { ATTNSettings } from './types';
import ATTNPlugin from './main';

export class ATTNSettingTab extends PluginSettingTab {
  plugin: ATTNPlugin;

  constructor(app: App, plugin: ATTNPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Audio To Tidied Notes Settings' });

    new Setting(containerEl)
      .setName('OpenAI API Key')
      .setDesc('Enter your OpenAI API key to enable audio transcription and summarization')
      .addText(text => text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.openaiApiKey)
        .onChange(async (value) => {
          this.plugin.settings.openaiApiKey = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Save Folder Path')
      .setDesc('Specify the folder where generated notes will be saved (e.g., "Notes/Meetings" or "/" for root)')
      .addText(text => text
        .setPlaceholder('/')
        .setValue(this.plugin.settings.saveFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.saveFolderPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Note Filename Template')
      .setDesc('Template for generated note filenames. Available placeholders: {{filename}}, {{date:format}}, {{time:format}}')
      .addText(text => text
        .setPlaceholder('{{filename}}-회의록-{{date:YYYY-MM-DD}}')
        .setValue(this.plugin.settings.noteFilenameTemplate)
        .onChange(async (value) => {
          this.plugin.settings.noteFilenameTemplate = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Note Content Template')
      .setDesc('Template for note content. Available placeholders: {{filename}}, {{summary}}, {{transcript}}, {{date:format}}, {{time:format}}')
      .addTextArea(text => text
        .setPlaceholder('# 회의록\\n\\n**원본 파일:** {{filename}}\\n**생성 날짜:** {{date:YYYY-MM-DD}}\\n\\n## 요약\\n\\n{{summary}}')
        .setValue(this.plugin.settings.noteContentTemplate)
        .onChange(async (value) => {
          this.plugin.settings.noteContentTemplate = value;
          await this.plugin.saveSettings();
        }));
  }
}