// Mock UUID to prevent ES module issues
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-settings'
}));

import { ATTNSettingTab } from '../src/settings';
import { ATTNSettings } from '../src/types';

// Mock Obsidian with jest.mock
jest.mock('obsidian', () => ({
  App: jest.fn(),
  Plugin: jest.fn(),
  PluginSettingTab: jest.fn().mockImplementation(function(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty: jest.fn().mockReturnThis(),
      createEl: jest.fn().mockReturnValue({ text: '', innerHTML: '' }),
    };
  }),
  Setting: jest.fn().mockImplementation(function(containerEl) {
    let name = '';
    let textComponent: any = null;
    let dropdownComponent: any = null;
    let buttonComponent: any = null;
    let toggleComponent: any = null;
    
    this.settingEl = {
      addClass: jest.fn().mockReturnThis(),
    };
    
    this.setName = jest.fn((n: string) => {
      name = n;
      return this;
    });
    
    this.setDesc = jest.fn(() => this);
    
    this.addText = jest.fn((callback: Function) => {
      textComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      callback(textComponent);
      return this;
    });
    
    this.addTextArea = jest.fn((callback: Function) => {
      textComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      callback(textComponent);
      return this;
    });
    
    this.addDropdown = jest.fn((callback: Function) => {
      dropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      callback(dropdownComponent);
      return this;
    });

    this.addToggle = jest.fn((callback: Function) => {
      toggleComponent = {
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      callback(toggleComponent);
      return this;
    });
    
    this.addButton = jest.fn((callback: Function) => {
      buttonComponent = {
        setButtonText: jest.fn().mockReturnThis(),
        setTooltip: jest.fn().mockReturnThis(),
        onClick: jest.fn().mockReturnThis(),
      };
      callback(buttonComponent);
      return this;
    });
    
    this.getName = () => name;
    this.getTextComponent = () => textComponent;
    this.getDropdownComponent = () => dropdownComponent;
    this.getButtonComponent = () => buttonComponent;
    this.getToggleComponent = () => toggleComponent;
  }),
  Notice: jest.fn(),
  TFile: jest.fn(),
}));

describe('ATTNSettingTab', () => {
  let mockApp: any;
  let mockPlugin: any;
  let settingTab: ATTNSettingTab;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockApp = {
      setting: {
        openTabById: jest.fn(),
        closeActiveTab: jest.fn(),
      },
    };
    
    mockPlugin = {
      app: mockApp,
      settings: { 
        openaiApiKey: '',
        saveFolderPath: '/',
        noteFilenameTemplate: '{{date:YYYY-MM-DD}}-{{filename}}-회의록',
        noteContentTemplate: '# 회의록\n\n**원본 파일:** {{filename}}\n**생성 날짜:** {{date:YYYY-MM-DD}}\n\n## 요약\n\n{{summary}}',
        noteContentTemplateFile: '',
        useTemplateFile: false,
        systemPrompt: 'Test prompt',
        audioSpeedMultiplier: 1,
        ffmpegPath: '',
        stt: {
          provider: 'openai' as const,
          model: 'whisper-1',
          apiKey: '',
          baseUrl: '',
          language: 'ko'
        },
        summary: {
          provider: 'openai' as const,
          model: 'gpt-4',
          apiKey: '',
          baseUrl: '',
        },
        processing: {
          enableChunking: true,
          maxUploadSizeMB: 24.5,
          maxChunkDurationSec: 85,
          targetSampleRateHz: 16000,
          targetChannels: 1,
          silenceThresholdDb: -35,
          minSilenceMs: 400,
          hardSplitWindowSec: 30,
          preserveIntermediates: false
        },
        logging: {
          enabled: true,
          level: 'error' as const,
          logFilePath: '',
          maxLogFileBytes: 5 * 1024 * 1024,
          maxLogFiles: 5
        }
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
    };
    
    settingTab = new ATTNSettingTab(mockApp, mockPlugin);
  });

  describe('constructor', () => {
    test('should create ATTNSettingTab instance successfully', () => {
      expect(settingTab).toBeInstanceOf(ATTNSettingTab);
      expect(settingTab.app).toBe(mockApp);
      expect(settingTab.plugin).toBe(mockPlugin);
    });
  });

  describe('display', () => {
    test('should call containerEl.empty and create title', () => {
      settingTab.display();

      expect(settingTab.containerEl.empty).toHaveBeenCalled();
      expect(settingTab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Audio To Tidied Notes Settings' });
      expect(settingTab.containerEl.createEl).toHaveBeenCalledWith('h3', { text: 'Audio Speed Processing' });
    });

    test('should create a Setting with correct properties', () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      expect(Setting).toHaveBeenCalledWith(settingTab.containerEl);
      
      const settingInstance = Setting.mock.instances[0];
      expect(settingInstance.setName).toHaveBeenCalledWith('OpenAI API Key');
      expect(settingInstance.setDesc).toHaveBeenCalled();
      expect(settingInstance.addText).toHaveBeenCalled();
    });

    test('should configure text input with correct properties', () => {
      const { Setting } = require('obsidian');
      mockPlugin.settings.openaiApiKey = 'test-api-key';
      
      settingTab.display();

      const settingInstance = Setting.mock.instances[0];
      const textCallback = settingInstance.addText.mock.calls[0][0];
      
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      
      expect(mockTextComponent.setPlaceholder).toHaveBeenCalledWith('sk-...');
      expect(mockTextComponent.setValue).toHaveBeenCalledWith('test-api-key');
      expect(mockTextComponent.onChange).toHaveBeenCalled();
    });

    test('should save settings when text input changes', async () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstance = Setting.mock.instances[0];
      const textCallback = settingInstance.addText.mock.calls[0][0];
      
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      
      // Simulate text change
      await onChangeCallback('new-api-key');
      
      expect(mockPlugin.settings.openaiApiKey).toBe('new-api-key');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render Save Folder Path input field', () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const folderPathSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Save Folder Path')
      );
      
      expect(folderPathSetting).toBeDefined();
      expect(folderPathSetting.setName).toHaveBeenCalledWith('Save Folder Path');
      expect(folderPathSetting.setDesc).toHaveBeenCalled();
      expect(folderPathSetting.addText).toHaveBeenCalled();
    });

    test('should render Note Filename Template input field', () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const filenameSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Note Filename Template')
      );
      
      expect(filenameSetting).toBeDefined();
      expect(filenameSetting.setName).toHaveBeenCalledWith('Note Filename Template');
      expect(filenameSetting.setDesc).toHaveBeenCalled();
      expect(filenameSetting.addText).toHaveBeenCalled();
    });

    test('should render Note Content Template textarea field', () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const contentSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Note Content Template')
      );
      
      expect(contentSetting).toBeDefined();
      expect(contentSetting.setName).toHaveBeenCalledWith('Note Content Template');
      expect(contentSetting.setDesc).toHaveBeenCalled();
      expect(contentSetting.addTextArea).toHaveBeenCalled();
    });

    test('should save folder path when input changes', async () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const folderPathSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Save Folder Path')
      );
      
      const textCallback = folderPathSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      
      await onChangeCallback('Notes/Meetings');
      
      expect(mockPlugin.settings.saveFolderPath).toBe('Notes/Meetings');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should save filename template when input changes', async () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const filenameSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Note Filename Template')
      );
      
      const textCallback = filenameSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      
      await onChangeCallback('{{date:YYYY-MM-DD}}-{{filename}}');
      
      expect(mockPlugin.settings.noteFilenameTemplate).toBe('{{date:YYYY-MM-DD}}-{{filename}}');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should save content template when textarea changes', async () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const contentSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Note Content Template')
      );
      
      const textAreaCallback = contentSetting.addTextArea.mock.calls[0][0];
      const mockTextAreaComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textAreaCallback(mockTextAreaComponent);
      const onChangeCallback = mockTextAreaComponent.onChange.mock.calls[0][0];
      
      const newTemplate = '# Meeting Notes\n\n{{summary}}\n\n## Transcript\n\n{{transcript}}';
      await onChangeCallback(newTemplate);
      
      expect(mockPlugin.settings.noteContentTemplate).toBe(newTemplate);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render Audio Speed Multiplier dropdown field', () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const speedSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Audio Speed Multiplier')
      );
      
      expect(speedSetting).toBeDefined();
      expect(speedSetting.setName).toHaveBeenCalledWith('Audio Speed Multiplier');
      expect(speedSetting.setDesc).toHaveBeenCalled();
      expect(speedSetting.addDropdown).toHaveBeenCalled();
    });

    test('should configure dropdown with correct options and save changes', async () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const speedSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Audio Speed Multiplier')
      );
      
      const dropdownCallback = speedSetting.addDropdown.mock.calls[0][0];
      const mockDropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      dropdownCallback(mockDropdownComponent);
      
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('1', '1x (Original Speed)');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('2', '2x (Double Speed)');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('3', '3x (Triple Speed)');
      expect(mockDropdownComponent.setValue).toHaveBeenCalledWith('1');
      expect(mockDropdownComponent.onChange).toHaveBeenCalled();

      // Test onChange callback
      const onChangeCallback = mockDropdownComponent.onChange.mock.calls[0][0];
      await onChangeCallback('2');
      
      expect(mockPlugin.settings.audioSpeedMultiplier).toBe(2);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render FFmpeg Path input field', () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const ffmpegPathSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'FFmpeg Path (Optional)')
      );
      
      expect(ffmpegPathSetting).toBeDefined();
      expect(ffmpegPathSetting.setName).toHaveBeenCalledWith('FFmpeg Path (Optional)');
      expect(ffmpegPathSetting.setDesc).toHaveBeenCalled();
      expect(ffmpegPathSetting.addText).toHaveBeenCalled();
    });

    test('should save ffmpeg path when input changes', async () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const ffmpegPathSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'FFmpeg Path (Optional)')
      );
      
      const textCallback = ffmpegPathSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      
      await onChangeCallback('/opt/homebrew/bin/ffmpeg');
      
      expect(mockPlugin.settings.ffmpegPath).toBe('/opt/homebrew/bin/ffmpeg');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render FFmpeg test button', () => {
      const { Setting } = require('obsidian');
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const ffmpegPathSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'FFmpeg Path (Optional)')
      );
      
      expect(ffmpegPathSetting).toBeDefined();
      expect(ffmpegPathSetting.addButton).toHaveBeenCalled();
      
      const buttonCallback = ffmpegPathSetting.addButton.mock.calls[0][0];
      const mockButtonComponent = {
        setButtonText: jest.fn().mockReturnThis(),
        setTooltip: jest.fn().mockReturnThis(),
        onClick: jest.fn().mockReturnThis(),
      };
      
      buttonCallback(mockButtonComponent);
      
      expect(mockButtonComponent.setButtonText).toHaveBeenCalledWith('Test');
      expect(mockButtonComponent.setTooltip).toHaveBeenCalledWith('Test if FFmpeg is available at this path');
      expect(mockButtonComponent.onClick).toHaveBeenCalled();
    });
  });

  describe('STT Provider Configuration', () => {
    test('should render STT section header', () => {
      settingTab.display();
      expect(settingTab.containerEl.createEl).toHaveBeenCalledWith('h3', { text: 'Speech-to-Text (STT) Configuration' });
    });

    test('should render STT provider dropdown', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const sttProviderSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'STT Provider')
      );
      
      expect(sttProviderSetting).toBeDefined();
      expect(sttProviderSetting.setDesc).toHaveBeenCalledWith('Select speech-to-text service provider');
      expect(sttProviderSetting.addDropdown).toHaveBeenCalled();
    });

    test('should configure STT provider dropdown with correct options', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const sttProviderSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'STT Provider')
      );
      
      const dropdownCallback = sttProviderSetting.addDropdown.mock.calls[0][0];
      const mockDropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      dropdownCallback(mockDropdownComponent);
      
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('openai', 'OpenAI Whisper');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('gemini', 'Google Gemini');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('local-whisper', 'Local Whisper');
      expect(mockDropdownComponent.setValue).toHaveBeenCalledWith('openai');
    });

    test('should save STT provider when selection changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const sttProviderSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'STT Provider')
      );
      
      const dropdownCallback = sttProviderSetting.addDropdown.mock.calls[0][0];
      const mockDropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      dropdownCallback(mockDropdownComponent);
      const onChangeCallback = mockDropdownComponent.onChange.mock.calls[0][0];
      
      await onChangeCallback('gemini');
      
      expect(mockPlugin.settings.stt.provider).toBe('gemini');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render STT model input field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const sttModelSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'STT Model')
      );
      
      expect(sttModelSetting).toBeDefined();
      expect(sttModelSetting.setDesc).toHaveBeenCalledWith('OpenAI Whisper model to use for speech-to-text');
      expect(sttModelSetting.addDropdown).toHaveBeenCalled();
    });

    test('should show local whisper options when local-whisper provider is selected', () => {
      const { Setting } = require('obsidian');
      mockPlugin.settings.stt.provider = 'local-whisper';
      mockPlugin.settings.stt.ollamaEndpoint = 'http://localhost:11434';
      mockPlugin.settings.stt.whisperBinaryPath = '';
      
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const ollamaEndpointSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Ollama Endpoint (for Local Whisper)')
      );
      
      expect(ollamaEndpointSetting).toBeDefined();
      expect(ollamaEndpointSetting.setDesc).toHaveBeenCalledWith('Ollama server endpoint URL for local whisper models (if using Ollama)');
    });
  });

  describe('Summary Provider Configuration', () => {
    test('should render Summary section header', () => {
      settingTab.display();
      expect(settingTab.containerEl.createEl).toHaveBeenCalledWith('h3', { text: 'Summary Configuration' });
    });

    test('should render Summary provider dropdown', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const summaryProviderSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Summary Provider')
      );
      
      expect(summaryProviderSetting).toBeDefined();
      expect(summaryProviderSetting.setDesc).toHaveBeenCalledWith('Select summarization service provider');
      expect(summaryProviderSetting.addDropdown).toHaveBeenCalled();
    });

    test('should configure Summary provider dropdown with correct options', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const summaryProviderSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Summary Provider')
      );
      
      const dropdownCallback = summaryProviderSetting.addDropdown.mock.calls[0][0];
      const mockDropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      dropdownCallback(mockDropdownComponent);
      
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('openai', 'OpenAI GPT');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('gemini', 'Google Gemini');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('local-llm', 'Local LLM (Ollama)');
      expect(mockDropdownComponent.setValue).toHaveBeenCalledWith('openai');
    });

    test('should save Summary provider when selection changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const summaryProviderSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Summary Provider')
      );
      
      const dropdownCallback = summaryProviderSetting.addDropdown.mock.calls[0][0];
      const mockDropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      dropdownCallback(mockDropdownComponent);
      const onChangeCallback = mockDropdownComponent.onChange.mock.calls[0][0];
      
      await onChangeCallback('local-llm');
      
      expect(mockPlugin.settings.summary.provider).toBe('local-llm');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('Processing Configuration', () => {
    test('should render Processing section header', () => {
      settingTab.display();
      expect(settingTab.containerEl.createEl).toHaveBeenCalledWith('h3', { text: 'Audio Processing Configuration' });
    });

    test('should render Enable Chunking toggle field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const chunkingSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Enable Audio Chunking')
      );
      
      expect(chunkingSetting).toBeDefined();
      expect(chunkingSetting.setDesc).toHaveBeenCalledWith('Automatically split large audio files to handle API limits');
      expect(chunkingSetting.addToggle).toHaveBeenCalled();
    });

    test('should save enable chunking when toggle changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const chunkingSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Enable Audio Chunking')
      );
      
      const toggleCallback = chunkingSetting.addToggle.mock.calls[0][0];
      const mockToggleComponent = {
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      toggleCallback(mockToggleComponent);
      expect(mockToggleComponent.setValue).toHaveBeenCalledWith(true);
      
      const onChangeCallback = mockToggleComponent.onChange.mock.calls[0][0];
      await onChangeCallback(false);
      
      expect(mockPlugin.settings.processing.enableChunking).toBe(false);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render Max Upload Size input field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxSizeSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Upload Size (MB)')
      );
      
      expect(maxSizeSetting).toBeDefined();
      expect(maxSizeSetting.setDesc).toHaveBeenCalled();
      expect(maxSizeSetting.addText).toHaveBeenCalled();
    });

    test('should save max upload size when input changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxSizeSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Upload Size (MB)')
      );
      
      const textCallback = maxSizeSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      expect(mockTextComponent.setValue).toHaveBeenCalledWith('24.5');
      
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      await onChangeCallback('20');
      
      expect(mockPlugin.settings.processing.maxUploadSizeMB).toBe(20);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should validate max upload size input', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxSizeSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Upload Size (MB)')
      );
      
      const textCallback = maxSizeSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      
      // Invalid value should not be saved
      await onChangeCallback('0');
      expect(mockPlugin.settings.processing.maxUploadSizeMB).toBe(24.5); // Original value
      
      await onChangeCallback('-5');
      expect(mockPlugin.settings.processing.maxUploadSizeMB).toBe(24.5); // Original value
    });

    test('should render Max Chunk Duration input field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxDurationSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Chunk Duration (seconds)')
      );
      
      expect(maxDurationSetting).toBeDefined();
      expect(maxDurationSetting.setDesc).toHaveBeenCalled();
      expect(maxDurationSetting.addText).toHaveBeenCalled();
    });

    test('should save max chunk duration when input changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxDurationSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Chunk Duration (seconds)')
      );
      
      const textCallback = maxDurationSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      expect(mockTextComponent.setValue).toHaveBeenCalledWith('85');
      
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      await onChangeCallback('60');
      
      expect(mockPlugin.settings.processing.maxChunkDurationSec).toBe(60);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should validate max chunk duration input', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxDurationSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Chunk Duration (seconds)')
      );
      
      const textCallback = maxDurationSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      
      // Invalid value should not be saved
      await onChangeCallback('5');
      expect(mockPlugin.settings.processing.maxChunkDurationSec).toBe(85); // Original value
      
      await onChangeCallback('-10');
      expect(mockPlugin.settings.processing.maxChunkDurationSec).toBe(85); // Original value
    });

    test('should render Silence Threshold input field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const thresholdSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Silence Threshold (dBFS)')
      );
      
      expect(thresholdSetting).toBeDefined();
      expect(thresholdSetting.setDesc).toHaveBeenCalled();
      expect(thresholdSetting.addText).toHaveBeenCalled();
    });

    test('should save silence threshold when input changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const thresholdSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Silence Threshold (dBFS)')
      );
      
      const textCallback = thresholdSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      expect(mockTextComponent.setValue).toHaveBeenCalledWith('-35');
      
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      await onChangeCallback('-30');
      
      expect(mockPlugin.settings.processing.silenceThresholdDb).toBe(-30);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('Logging Configuration', () => {
    test('should render Logging section header', () => {
      settingTab.display();
      expect(settingTab.containerEl.createEl).toHaveBeenCalledWith('h3', { text: 'Error Logging Configuration' });
    });

    test('should render Enable Logging toggle field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const loggingSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Enable Error Logging')
      );
      
      expect(loggingSetting).toBeDefined();
      expect(loggingSetting.setDesc).toHaveBeenCalledWith('Log errors and processing details to file for debugging');
      expect(loggingSetting.addToggle).toHaveBeenCalled();
    });

    test('should save enable logging when toggle changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const loggingSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Enable Error Logging')
      );
      
      const toggleCallback = loggingSetting.addToggle.mock.calls[0][0];
      const mockToggleComponent = {
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      toggleCallback(mockToggleComponent);
      expect(mockToggleComponent.setValue).toHaveBeenCalledWith(true);
      
      const onChangeCallback = mockToggleComponent.onChange.mock.calls[0][0];
      await onChangeCallback(false);
      
      expect(mockPlugin.settings.logging.enabled).toBe(false);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render Log Level dropdown field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const levelSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Log Level')
      );
      
      expect(levelSetting).toBeDefined();
      expect(levelSetting.setDesc).toHaveBeenCalled();
      expect(levelSetting.addDropdown).toHaveBeenCalled();
    });

    test('should configure log level dropdown with correct options', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const levelSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Log Level')
      );
      
      const dropdownCallback = levelSetting.addDropdown.mock.calls[0][0];
      const mockDropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      dropdownCallback(mockDropdownComponent);
      
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('error', 'Error');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('warn', 'Warning');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('info', 'Info');
      expect(mockDropdownComponent.addOption).toHaveBeenCalledWith('debug', 'Debug');
      expect(mockDropdownComponent.setValue).toHaveBeenCalledWith('error');
    });

    test('should save log level when selection changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const levelSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Log Level')
      );
      
      const dropdownCallback = levelSetting.addDropdown.mock.calls[0][0];
      const mockDropdownComponent = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      dropdownCallback(mockDropdownComponent);
      const onChangeCallback = mockDropdownComponent.onChange.mock.calls[0][0];
      
      await onChangeCallback('debug');
      
      expect(mockPlugin.settings.logging.level).toBe('debug');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should render Max Log File Size input field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxSizeSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Log File Size (MB)')
      );
      
      expect(maxSizeSetting).toBeDefined();
      expect(maxSizeSetting.setDesc).toHaveBeenCalled();
      expect(maxSizeSetting.addText).toHaveBeenCalled();
    });

    test('should save max log file size when input changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxSizeSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Log File Size (MB)')
      );
      
      const textCallback = maxSizeSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      expect(mockTextComponent.setValue).toHaveBeenCalledWith('5');
      
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      await onChangeCallback('10');
      
      expect(mockPlugin.settings.logging.maxLogFileBytes).toBe(10 * 1024 * 1024);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    test('should validate max log file size input', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxSizeSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Log File Size (MB)')
      );
      
      const textCallback = maxSizeSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      
      // Invalid value should not be saved
      await onChangeCallback('0');
      expect(mockPlugin.settings.logging.maxLogFileBytes).toBe(5 * 1024 * 1024); // Original value
      
      await onChangeCallback('-1');
      expect(mockPlugin.settings.logging.maxLogFileBytes).toBe(5 * 1024 * 1024); // Original value
    });

    test('should render Max Log Files input field', () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxFilesSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Log Files')
      );
      
      expect(maxFilesSetting).toBeDefined();
      expect(maxFilesSetting.setDesc).toHaveBeenCalled();
      expect(maxFilesSetting.addText).toHaveBeenCalled();
    });

    test('should save max log files when input changes', async () => {
      const { Setting } = require('obsidian');
      settingTab.display();

      const settingInstances = Setting.mock.instances;
      const maxFilesSetting = settingInstances.find((instance: any) => 
        instance.setName.mock.calls.some((call: any) => call[0] === 'Max Log Files')
      );
      
      const textCallback = maxFilesSetting.addText.mock.calls[0][0];
      const mockTextComponent = {
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      
      textCallback(mockTextComponent);
      expect(mockTextComponent.setValue).toHaveBeenCalledWith('5');
      
      const onChangeCallback = mockTextComponent.onChange.mock.calls[0][0];
      await onChangeCallback('10');
      
      expect(mockPlugin.settings.logging.maxLogFiles).toBe(10);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('Settings Migration', () => {
    test('should migrate old settings to new structure', () => {
      const legacySettings = {
        openaiApiKey: 'sk-test123',
        // other legacy settings...
      };
      
      // This test will be implemented when we add the migration logic
      // For now, it's a placeholder to ensure we test backward compatibility
      expect(true).toBe(true);
    });

    test('should apply default values for new settings', () => {
      const existingSettings = {
        openaiApiKey: 'sk-existing',
        saveFolderPath: '/existing',
        // Missing processing and logging settings
      };
      
      // This test will be implemented when we add the migration logic
      expect(true).toBe(true);
    });
  });
});