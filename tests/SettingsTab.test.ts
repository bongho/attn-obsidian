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
    
    this.getName = () => name;
    this.getTextComponent = () => textComponent;
    this.getDropdownComponent = () => dropdownComponent;
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
        audioSpeedMultiplier: 1,
        ffmpegPath: ''
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
  });
});