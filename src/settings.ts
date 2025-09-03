import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { ATTNSettings } from './types';
import ATTNPlugin from './main';
import { AudioProcessor } from './audioProcessor';

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
        .setPlaceholder('{{date:YYYY-MM-DD}}-{{filename}}-회의록')
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

    new Setting(containerEl)
      .setName('Audio Speed Multiplier')
      .setDesc('Speed up audio processing to reduce input tokens. Higher speeds may affect transcription accuracy.')
      .addDropdown(dropdown => dropdown
        .addOption('1', '1x (Original Speed)')
        .addOption('2', '2x (Double Speed)')
        .addOption('3', '3x (Triple Speed)')
        .setValue(this.plugin.settings.audioSpeedMultiplier.toString())
        .onChange(async (value) => {
          this.plugin.settings.audioSpeedMultiplier = parseInt(value) as 1 | 2 | 3;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('FFmpeg Path (Optional)')
      .setDesc('Specify custom FFmpeg executable path. Leave empty to use system PATH. Required for audio speed processing.')
      .addText(text => text
        .setPlaceholder('/opt/homebrew/bin/ffmpeg or C:\\ffmpeg\\bin\\ffmpeg.exe')
        .setValue(this.plugin.settings.ffmpegPath)
        .onChange(async (value) => {
          this.plugin.settings.ffmpegPath = value;
          await this.plugin.saveSettings();
        }))
      .addButton(button => button
        .setButtonText('Test')
        .setTooltip('Test if FFmpeg is available at this path')
        .onClick(async () => {
          const testNotice = new Notice('Testing FFmpeg...', 0);
          try {
            const audioProcessor = new AudioProcessor(this.plugin.settings.ffmpegPath);
            const isAvailable = await audioProcessor.checkFFmpegAvailability();
            
            testNotice.hide();
            if (isAvailable) {
              new Notice('✅ FFmpeg is working correctly!', 3000);
            } else {
              new Notice('❌ FFmpeg not found. Please check the path.', 5000);
            }
          } catch (error) {
            testNotice.hide();
            new Notice('❌ Error testing FFmpeg: ' + (error instanceof Error ? error.message : 'Unknown error'), 5000);
          }
        }));
  }
}