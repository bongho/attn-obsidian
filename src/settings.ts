import { App, PluginSettingTab, Setting, Notice, SuggestModal } from 'obsidian';
import { ATTNSettings, SttProvider, SummaryProvider, WhisperBackend } from './types';
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

    // Save Folder Path with real-time autocomplete
    const saveFolderSetting = new Setting(containerEl)
      .setName('Save Folder Path')
      .setDesc('Specify the folder where generated notes will be saved. Type to see suggestions or click "Browse".')
      .addText(text => text
        .setPlaceholder('/')
        .setValue(this.plugin.settings.saveFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.saveFolderPath = value;
          await this.plugin.saveSettings();
        }))
      .addButton(button => button
        .setButtonText('Browse')
        .setTooltip('Browse and select folder')
        .onClick(async () => {
          const folders = this.getAllFolders();
          const modal = new FolderSuggestModal(this.app, folders);
          modal.onChoose = (folder: string) => {
            // Update the text input
            const textInputs = containerEl.querySelectorAll('input[type="text"]');
            const saveFolderInput = Array.from(textInputs).find(input => 
              (input as HTMLInputElement).value === this.plugin.settings.saveFolderPath
            ) as HTMLInputElement;
            
            if (saveFolderInput) {
              saveFolderInput.value = folder;
              saveFolderInput.dispatchEvent(new Event('input'));
            }
          };
          modal.open();
        }));

    // Add autocomplete dropdown to save folder input
    setTimeout(() => {
      const saveFolderInput = saveFolderSetting.settingEl.querySelector('input[type="text"]') as HTMLInputElement;
      if (saveFolderInput) {
        const inputContainer = saveFolderInput.parentElement;
        if (inputContainer) {
          inputContainer.style.position = 'relative';
          const dropdown = this.createAutocompleteDropdown(saveFolderInput, (input) => this.getFolderSuggestions(input));
          inputContainer.appendChild(dropdown);
        }
      }
    }, 0);

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
      // Template File Path with real-time autocomplete
      const templateFileSetting = new Setting(containerEl)
        .setName('Template File Path')
        .setDesc('Path to your template file. Type to see suggestions or click "Browse".')
        .addText(text => text
          .setPlaceholder('Templates/meeting-template.md')
          .setValue(this.plugin.settings.noteContentTemplateFile)
          .onChange(async (value) => {
            this.plugin.settings.noteContentTemplateFile = value;
            await this.plugin.saveSettings();
          }))
        .addButton(button => button
          .setButtonText('Browse')
          .setTooltip('Browse and select template file')
          .onClick(async () => {
            const files = this.app.vault.getMarkdownFiles().map(file => file.path);
            const modal = new FileSuggestModal(this.app, files);
            modal.onChoose = (filePath: string) => {
              // Update the text input
              const textInputs = containerEl.querySelectorAll('input[type="text"]');
              const templateFileInput = Array.from(textInputs).find(input => 
                (input as HTMLInputElement).value === this.plugin.settings.noteContentTemplateFile
              ) as HTMLInputElement;
              
              if (templateFileInput) {
                templateFileInput.value = filePath;
                templateFileInput.dispatchEvent(new Event('input'));
              }
            };
            modal.open();
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

      // Add autocomplete dropdown to template file input
      setTimeout(() => {
        const templateFileInput = templateFileSetting.settingEl.querySelector('input[type="text"]') as HTMLInputElement;
        if (templateFileInput) {
          const inputContainer = templateFileInput.parentElement;
          if (inputContainer) {
            inputContainer.style.position = 'relative';
            const dropdown = this.createAutocompleteDropdown(templateFileInput, (input) => this.getFileSuggestions(input));
            inputContainer.appendChild(dropdown);
          }
        }
      }, 0);
    } else {
      const templateSetting = new Setting(containerEl)
        .setName('Note Content Template')
        .setDesc('Template for note content. Available placeholders: {{filename}}, {{summary}}, {{transcript}}, {{date:format}}, {{time:format}}')
        .addTextArea(text => text
          .setPlaceholder('# 회의록\\n\\n**원본 파일:** {{filename}}\\n**생성 날짜:** {{date:YYYY-MM-DD}}\\n\\n## 요약\\n\\n{{summary}}')
          .setValue(this.plugin.settings.noteContentTemplate)
          .onChange(async (value) => {
            this.plugin.settings.noteContentTemplate = value;
            await this.plugin.saveSettings();
          }));
      
      // Add CSS classes manually
      templateSetting.settingEl.addClass('attn-large-textarea');
      templateSetting.settingEl.addClass('attn-template-textarea');
    }

    // Speech-to-Text Configuration Section
    containerEl.createEl('h3', { text: 'Speech-to-Text (STT) Configuration' });

    new Setting(containerEl)
      .setName('STT Provider')
      .setDesc('Select speech-to-text service provider')
      .addDropdown(dropdown => dropdown
        .addOption('openai', 'OpenAI Whisper')
        .addOption('gemini', 'Google Gemini')
        .addOption('local-whisper', 'Local Whisper')
        .setValue(this.plugin.settings.stt.provider)
        .onChange(async (value) => {
          this.plugin.settings.stt.provider = value as SttProvider;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide provider-specific fields
        }));

    // STT Model selection based on provider
    this.createSttModelSetting(containerEl);

    // Provider-specific settings
    if (this.plugin.settings.stt.provider === 'local-whisper') {
      new Setting(containerEl)
        .setName('Whisper Backend')
        .setDesc('Choose the whisper implementation to use')
        .addDropdown(dropdown => dropdown
          .addOption('faster-whisper-cpp', 'faster-whisper-cpp')
          .addOption('whisper.cpp', 'whisper.cpp')
          .setValue(this.plugin.settings.stt.whisperBackend || 'faster-whisper-cpp')
          .onChange(async (value) => {
            this.plugin.settings.stt.whisperBackend = value as WhisperBackend;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Whisper Model Path/Name')
        .setDesc('Path to model file or model name (e.g., /path/to/model.bin or tiny/base/small/medium/large/large-v2)')
        .addText(text => text
          .setPlaceholder('base')
          .setValue(this.plugin.settings.stt.whisperModelPathOrName || '')
          .onChange(async (value) => {
            this.plugin.settings.stt.whisperModelPathOrName = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Ollama Endpoint (for Local Whisper)')
        .setDesc('Ollama server endpoint URL for local whisper models (if using Ollama)')
        .addText(text => text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.stt.ollamaEndpoint || '')
          .onChange(async (value) => {
            this.plugin.settings.stt.ollamaEndpoint = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Whisper Binary Path (Alternative)')
        .setDesc('Path to local whisper binary (alternative to Ollama)')
        .addText(text => text
          .setPlaceholder('/path/to/whisper or /path/to/faster-whisper')
          .setValue(this.plugin.settings.stt.whisperBinaryPath || '')
          .onChange(async (value) => {
            this.plugin.settings.stt.whisperBinaryPath = value;
            await this.plugin.saveSettings();
          }));
    }

    if (this.plugin.settings.stt.provider === 'openai' || this.plugin.settings.stt.provider === 'gemini') {
      new Setting(containerEl)
        .setName('STT API Key')
        .setDesc('API key for the selected provider (overrides OpenAI API Key above)')
        .addText(text => text
          .setPlaceholder('Enter API key...')
          .setValue(this.plugin.settings.stt.apiKey || '')
          .onChange(async (value) => {
            this.plugin.settings.stt.apiKey = value;
            await this.plugin.saveSettings();
          }));
    }

    // Summary Configuration Section
    containerEl.createEl('h3', { text: 'Summary Configuration' });

    new Setting(containerEl)
      .setName('Summary Provider')
      .setDesc('Select summarization service provider')
      .addDropdown(dropdown => dropdown
        .addOption('openai', 'OpenAI GPT')
        .addOption('gemini', 'Google Gemini')
        .addOption('local-llm', 'Local LLM (Ollama)')
        .setValue(this.plugin.settings.summary.provider)
        .onChange(async (value) => {
          this.plugin.settings.summary.provider = value as SummaryProvider;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide provider-specific fields
        }));

    // Summary Model selection based on provider
    this.createSummaryModelSetting(containerEl);

    if (this.plugin.settings.summary.provider === 'local-llm') {
      new Setting(containerEl)
        .setName('Ollama Endpoint (for Summary)')
        .setDesc('Ollama server endpoint URL for local language models')
        .addText(text => text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.summary.ollamaEndpoint || '')
          .onChange(async (value) => {
            this.plugin.settings.summary.ollamaEndpoint = value;
            await this.plugin.saveSettings();
          }));
    }

    if (this.plugin.settings.summary.provider === 'openai' || this.plugin.settings.summary.provider === 'gemini') {
      new Setting(containerEl)
        .setName('Summary API Key')
        .setDesc('API key for the selected provider (overrides OpenAI API Key above)')
        .addText(text => text
          .setPlaceholder('Enter API key...')
          .setValue(this.plugin.settings.summary.apiKey || '')
          .onChange(async (value) => {
            this.plugin.settings.summary.apiKey = value;
            await this.plugin.saveSettings();
          }));
    }

    // Legacy AI Configuration Section (kept for backward compatibility)
    containerEl.createEl('h3', { text: 'Legacy AI Configuration' });

    const promptSetting = new Setting(containerEl)
      .setName('System Prompt')
      .setDesc('Custom system prompt for AI summarization. This controls how the AI interprets and summarizes your content.')
      .addTextArea(text => text
        .setPlaceholder('Please provide a clear and concise summary of the audio transcript. Focus on key points, decisions made, and action items.')
        .setValue(this.plugin.settings.systemPrompt)
        .onChange(async (value) => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        }));
    
    // Add CSS classes manually
    promptSetting.settingEl.addClass('attn-large-textarea');
    promptSetting.settingEl.addClass('attn-prompt-textarea');

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

  private createSttModelSetting(containerEl: HTMLElement): void {
    const provider = this.plugin.settings.stt.provider;
    
    if (provider === 'openai') {
      new Setting(containerEl)
        .setName('STT Model')
        .setDesc('OpenAI Whisper model to use for speech-to-text')
        .addDropdown(dropdown => dropdown
          .addOption('whisper-1', 'whisper-1 (Recommended)')
          .setValue(this.plugin.settings.stt.model || 'whisper-1')
          .onChange(async (value) => {
            this.plugin.settings.stt.model = value;
            await this.plugin.saveSettings();
          }));
    } else if (provider === 'gemini') {
      new Setting(containerEl)
        .setName('STT Model')
        .setDesc('Google Gemini model for speech-to-text')
        .addDropdown(dropdown => dropdown
          .addOption('gemini-1.5-flash', 'gemini-1.5-flash')
          .addOption('gemini-1.5-pro', 'gemini-1.5-pro')
          .setValue(this.plugin.settings.stt.model || 'gemini-1.5-flash')
          .onChange(async (value) => {
            this.plugin.settings.stt.model = value;
            await this.plugin.saveSettings();
          }));
    } else if (provider === 'local-whisper') {
      new Setting(containerEl)
        .setName('Local Whisper Model')
        .setDesc('Select the Whisper model size to use')
        .addDropdown(dropdown => dropdown
          .addOption('tiny', 'tiny (~39MB)')
          .addOption('tiny.en', 'tiny.en (~39MB, English only)')
          .addOption('base', 'base (~74MB)')
          .addOption('base.en', 'base.en (~74MB, English only)')
          .addOption('small', 'small (~244MB)')
          .addOption('small.en', 'small.en (~244MB, English only)')
          .addOption('medium', 'medium (~769MB)')
          .addOption('medium.en', 'medium.en (~769MB, English only)')
          .addOption('large', 'large (~1550MB)')
          .addOption('large-v2', 'large-v2 (~1550MB)')
          .addOption('large-v3', 'large-v3 (~1550MB)')
          .setValue(this.plugin.settings.stt.model || 'base')
          .onChange(async (value) => {
            this.plugin.settings.stt.model = value;
            await this.plugin.saveSettings();
          }));
    }
  }

  private createSummaryModelSetting(containerEl: HTMLElement): void {
    const provider = this.plugin.settings.summary.provider;
    
    if (provider === 'openai') {
      new Setting(containerEl)
        .setName('Summary Model')
        .setDesc('OpenAI model to use for summarization')
        .addDropdown(dropdown => dropdown
          .addOption('gpt-5', 'gpt-5')
          .addOption('gpt-4', 'gpt-4 (Recommended)')
          .addOption('gpt-4-turbo', 'gpt-4-turbo')
          .addOption('gpt-4o', 'gpt-4o')
          .addOption('gpt-4o-mini', 'gpt-4o-mini')
          .addOption('gpt-3.5-turbo', 'gpt-3.5-turbo')
          .setValue(this.plugin.settings.summary.model || 'gpt-4')
          .onChange(async (value) => {
            this.plugin.settings.summary.model = value;
            await this.plugin.saveSettings();
          }));
    } else if (provider === 'gemini') {
      new Setting(containerEl)
        .setName('Summary Model')
        .setDesc('Google Gemini model for summarization')
        .addDropdown(dropdown => dropdown
          .addOption('gemini-1.5-flash', 'gemini-1.5-flash')
          .addOption('gemini-1.5-pro', 'gemini-1.5-pro')
          .addOption('gemini-pro', 'gemini-pro')
          .setValue(this.plugin.settings.summary.model || 'gemini-1.5-flash')
          .onChange(async (value) => {
            this.plugin.settings.summary.model = value;
            await this.plugin.saveSettings();
          }));
    } else if (provider === 'local-llm') {
      new Setting(containerEl)
        .setName('Summary Model')
        .setDesc('Local LLM model name (e.g., llama3.1, mistral, codellama)')
        .addText(text => text
          .setPlaceholder('llama3.1')
          .setValue(this.plugin.settings.summary.model || 'llama3.1')
          .onChange(async (value) => {
            this.plugin.settings.summary.model = value;
            await this.plugin.saveSettings();
          }));
    }
  }

  private getAllFolders(): string[] {
    const folders: string[] = ['/']; // Include root folder
    
    // Get all folders from existing file paths
    this.app.vault.getAllLoadedFiles().forEach(file => {
      if (file.path.includes('/')) {
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        if (!folders.includes(folderPath)) {
          folders.push(folderPath);
        }
      }
    });
    
    return folders.sort();
  }

  private getFolderSuggestions(input: string): string[] {
    const allFolders = this.getAllFolders();
    
    if (!input || input === '/') {
      return allFolders.slice(0, 10);
    }
    
    // If input ends with '/', show subfolders
    if (input.endsWith('/')) {
      const basePath = input.slice(0, -1);
      return allFolders
        .filter(folder => folder.startsWith(basePath + '/') && folder !== basePath)
        .slice(0, 10);
    }
    
    // Otherwise, filter folders that match the input
    return allFolders
      .filter(folder => folder.toLowerCase().includes(input.toLowerCase()))
      .slice(0, 10);
  }

  private getFileSuggestions(input: string): string[] {
    const allFiles = this.app.vault.getMarkdownFiles().map(file => file.path);
    
    if (!input) {
      return allFiles.slice(0, 10);
    }
    
    // If input ends with '/', show files in that directory
    if (input.endsWith('/')) {
      const dirPath = input.slice(0, -1);
      return allFiles
        .filter(file => {
          const fileDir = file.substring(0, file.lastIndexOf('/'));
          return fileDir === dirPath || (dirPath === '' && !file.includes('/'));
        })
        .slice(0, 10);
    }
    
    // Otherwise, filter files that match the input
    return allFiles
      .filter(file => file.toLowerCase().includes(input.toLowerCase()))
      .slice(0, 10);
  }

  private createAutocompleteDropdown(input: HTMLInputElement, getSuggestions: (value: string) => string[]): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'attn-autocomplete-dropdown';
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    `;
    
    const updateDropdown = () => {
      const suggestions = getSuggestions(input.value);
      dropdown.innerHTML = '';
      
      if (suggestions.length === 0) {
        dropdown.style.display = 'none';
        return;
      }
      
      suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'attn-autocomplete-item';
        item.textContent = suggestion;
        item.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--background-modifier-border-hover);
        `;
        
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--background-modifier-hover)';
        });
        
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = '';
        });
        
        item.addEventListener('click', () => {
          input.value = suggestion;
          input.dispatchEvent(new Event('input'));
          dropdown.style.display = 'none';
        });
        
        dropdown.appendChild(item);
      });
      
      dropdown.style.display = 'block';
    };
    
    input.addEventListener('input', updateDropdown);
    input.addEventListener('focus', updateDropdown);
    
    input.addEventListener('blur', () => {
      // Delay hiding to allow click on dropdown items
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 150);
    });
    
    return dropdown;
  }
}

// Modal classes for file and folder selection
// Only define these classes if SuggestModal is available (not in test environment)
let FolderSuggestModal: any;
let FileSuggestModal: any;

if (typeof SuggestModal !== 'undefined') {
  FolderSuggestModal = class extends SuggestModal<string> {
    private folders: string[];
    public onChoose: (folder: string) => void = () => {};

    constructor(app: App, folders: string[]) {
      super(app);
      this.folders = folders;
      this.setPlaceholder('Type to search folders...');
    }

    getSuggestions(query: string): string[] {
      return this.folders.filter(folder =>
        folder.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);
    }

    renderSuggestion(folder: string, el: HTMLElement) {
      el.createEl('div', { text: folder || '/' });
    }

    onChooseSuggestion(folder: string) {
      this.onChoose(folder);
      this.close();
    }
  };

  FileSuggestModal = class extends SuggestModal<string> {
    private files: string[];
    public onChoose: (file: string) => void = () => {};

    constructor(app: App, files: string[]) {
      super(app);
      this.files = files;
      this.setPlaceholder('Type to search template files...');
    }

    getSuggestions(query: string): string[] {
      return this.files.filter(file =>
        file.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);
    }

    renderSuggestion(file: string, el: HTMLElement) {
      el.createEl('div', { text: file });
    }

    onChooseSuggestion(file: string) {
      this.onChoose(file);
      this.close();
    }
  };
} else {
  // Fallback for test environment
  FolderSuggestModal = class {
    public onChoose: (folder: string) => void = () => {};
    constructor(app: App, folders: string[]) {}
    open() {}
  };

  FileSuggestModal = class {
    public onChoose: (file: string) => void = () => {};
    constructor(app: App, files: string[]) {}
    open() {}
  };
}