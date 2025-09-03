import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { ATTNSettings } from './types';
import ATTNPlugin from './main';
import { AudioProcessor } from './audioProcessor';
import { TemplateLoader } from './templateLoader';

export class ATTNSettingTab extends PluginSettingTab {
  plugin: ATTNPlugin;

  constructor(app: App, plugin: ATTNPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    
    // Add custom CSS for larger text areas
    this.addCustomStyles();

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

    // Template Configuration Section
    containerEl.createEl('h3', { text: 'Template Configuration' });

    new Setting(containerEl)
      .setName('Use Template File')
      .setDesc('Use a template file from your vault instead of inline template text')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useTemplateFile)
        .onChange(async (value) => {
          this.plugin.settings.useTemplateFile = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh the display to show/hide relevant fields
        }));

    if (this.plugin.settings.useTemplateFile) {
      new Setting(containerEl)
        .setName('Template File Path')
        .setDesc('Path to your template file (e.g., "Templates/meeting-template.md")')
        .addText(text => text
          .setPlaceholder('Templates/meeting-template.md')
          .setValue(this.plugin.settings.noteContentTemplateFile)
          .onChange(async (value) => {
            this.plugin.settings.noteContentTemplateFile = value;
            await this.plugin.saveSettings();
          }))
        .addButton(button => button
          .setButtonText('Test')
          .setTooltip('Test if template file exists and is readable')
          .onClick(async () => {
            const testNotice = new Notice('Testing template file...', 0);
            try {
              const templateLoader = new TemplateLoader(this.app.vault);
              const isValid = templateLoader.validateTemplateFile(this.plugin.settings.noteContentTemplateFile);
              
              testNotice.hide();
              if (isValid) {
                const content = await templateLoader.loadTemplateFromFile(this.plugin.settings.noteContentTemplateFile);
                new Notice(`✅ Template file loaded! (${content.length} characters)`, 3000);
              } else {
                new Notice('❌ Template file not found. Please check the path.', 5000);
              }
            } catch (error) {
              testNotice.hide();
              new Notice('❌ Error loading template: ' + (error instanceof Error ? error.message : 'Unknown error'), 5000);
            }
          }));
    } else {
      new Setting(containerEl)
        .setName('Note Content Template')
        .setDesc('Template for note content. Available placeholders: {{filename}}, {{summary}}, {{transcript}}, {{date:format}}, {{time:format}}')
        .setClass('attn-large-textarea attn-template-textarea')
        .addTextArea(text => text
          .setPlaceholder('# 회의록\\n\\n**원본 파일:** {{filename}}\\n**생성 날짜:** {{date:YYYY-MM-DD}}\\n\\n## 요약\\n\\n{{summary}}')
          .setValue(this.plugin.settings.noteContentTemplate)
          .onChange(async (value) => {
            this.plugin.settings.noteContentTemplate = value;
            await this.plugin.saveSettings();
          }));
    }

    // AI Configuration Section
    containerEl.createEl('h3', { text: 'AI Configuration' });

    new Setting(containerEl)
      .setName('System Prompt')
      .setDesc('Custom system prompt for AI summarization. This controls how the AI interprets and summarizes your content.')
      .setClass('attn-large-textarea attn-prompt-textarea')
      .addTextArea(text => text
        .setPlaceholder('Please provide a clear and concise summary of the audio transcript. Focus on key points, decisions made, and action items.')
        .setValue(this.plugin.settings.systemPrompt)
        .onChange(async (value) => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        }));

    // Audio Speed Processing Section
    containerEl.createEl('h3', { text: 'Audio Speed Processing' });

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
      .setDesc('Specify custom FFmpeg executable path. Leave empty to use system PATH. Required for audio speed processing above 1x.')
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

  private addCustomStyles(): void {
    // Check if styles are already added
    if (document.getElementById('attn-settings-styles')) {
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'attn-settings-styles';
    styleEl.textContent = `
      .attn-large-textarea .setting-item-control {
        display: block !important;
        width: 100% !important;
        margin-top: 8px !important;
      }
      
      .attn-large-textarea .setting-item-info {
        margin-bottom: 8px !important;
      }
      
      .attn-large-textarea textarea {
        width: 100% !important;
        min-height: 120px !important;
        resize: vertical !important;
        padding: 8px !important;
        border-radius: 4px !important;
        border: 1px solid var(--background-modifier-border) !important;
        background: var(--background-primary-alt) !important;
        color: var(--text-normal) !important;
        font-family: var(--font-text) !important;
        font-size: var(--font-size-small) !important;
        line-height: 1.4 !important;
      }
      
      /* Template-specific styling */
      .attn-template-textarea textarea {
        font-family: var(--font-monospace) !important;
        min-height: 150px !important;
        font-size: var(--font-size-smaller) !important;
      }
      
      /* System prompt specific styling */
      .attn-prompt-textarea textarea {
        min-height: 120px !important;
      }
      
      .attn-large-textarea textarea:focus {
        border-color: var(--interactive-accent) !important;
        box-shadow: 0 0 0 2px var(--interactive-accent-hover) !important;
        outline: none !important;
      }
      
      .attn-large-textarea textarea::placeholder {
        color: var(--text-muted) !important;
        opacity: 0.7 !important;
      }
    `;
    
    document.head.appendChild(styleEl);
  }
}