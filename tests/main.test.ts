// Mock OpenAI to prevent shim issues
jest.mock('openai', () => jest.fn());

// Mock the dependencies BEFORE importing main
jest.mock('../src/apiService');
jest.mock('../src/noteCreator');
jest.mock('../src/templateProcessor');
jest.mock('../src/configLoader');

import ATTNPlugin from '../src/main';
import { ApiService } from '../src/apiService';
import { NoteCreator } from '../src/noteCreator';
import { TemplateProcessor } from '../src/templateProcessor';
import { ConfigLoader } from '../src/configLoader';

// Mock Obsidian classes
class MockWorkspace {
  on = jest.fn();
  off = jest.fn();
}

class MockApp {
  workspace = new MockWorkspace();
  setting = {
    openTabById: jest.fn(),
    closeActiveTab: jest.fn(),
  };
  vault = {
    create: jest.fn(),
    exists: jest.fn(),
  };
}

class MockTFile {
  name: string;
  basename: string;
  extension: string;
  path: string;

  constructor(name: string, extension: string) {
    this.name = name;
    this.basename = name.replace(/\.[^/.]+$/, '');
    this.extension = extension;
    this.path = `/${name}`;
  }
}

class MockMenu {
  private items: Array<{
    title: string;
    icon: string;
    onClick: () => void;
  }> = [];

  addItem(callback: (item: any) => void) {
    const item = {
      setTitle: jest.fn().mockReturnThis(),
      setIcon: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockReturnThis(),
    };
    
    callback(item);
    
    this.items.push({
      title: item.setTitle.mock.calls[0]?.[0] || '',
      icon: item.setIcon.mock.calls[0]?.[0] || '',
      onClick: item.onClick.mock.calls[0]?.[0] || (() => {}),
    });
    
    return this;
  }

  getItems() {
    return this.items;
  }

  clickItem(title: string) {
    const item = this.items.find(i => i.title === title);
    if (item) {
      item.onClick();
    }
  }
}

describe('ATTNPlugin Integration', () => {
  let plugin: ATTNPlugin;
  let mockApp: MockApp;
  let mockApiService: jest.Mocked<ApiService>;
  let mockNoteCreator: jest.Mocked<NoteCreator>;
  let mockTemplateProcessor: jest.Mocked<TemplateProcessor>;
  let mockConfigLoader: jest.Mocked<ConfigLoader>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockApp = new MockApp();
    plugin = new ATTNPlugin(mockApp as any, {} as any);
    
    // Mock the constructors
    mockApiService = {
      processAudioFile: jest.fn(),
    } as any;
    
    mockNoteCreator = {
      createNote: jest.fn(),
    } as any;
    
    mockTemplateProcessor = {
      process: jest.fn(),
    } as any;
    
    mockConfigLoader = {
      getInstance: jest.fn().mockReturnThis(),
      getOpenAIApiKey: jest.fn().mockReturnValue(null),
      isDebugMode: jest.fn().mockReturnValue(false),
      getConfigPath: jest.fn().mockReturnValue(''),
    } as any;
    
    (ApiService as jest.MockedClass<typeof ApiService>).mockImplementation(() => mockApiService);
    (NoteCreator as jest.MockedClass<typeof NoteCreator>).mockImplementation(() => mockNoteCreator);
    (TemplateProcessor as jest.MockedClass<typeof TemplateProcessor>).mockImplementation(() => mockTemplateProcessor);
    (ConfigLoader.getInstance as jest.MockedFunction<typeof ConfigLoader.getInstance>).mockReturnValue(mockConfigLoader);

    // Mock plugin methods
    plugin.addSettingTab = jest.fn();
    plugin.registerEvent = jest.fn();
    plugin.loadData = jest.fn().mockResolvedValue({ 
      openaiApiKey: 'test-key',
      saveFolderPath: 'Notes/Meetings',
      noteFilenameTemplate: '{{filename}}-{{date:YYYY-MM-DD}}',
      noteContentTemplate: '# Meeting\n\n{{summary}}'
    });
    plugin.saveData = jest.fn().mockResolvedValue(undefined);
  });

  describe('onload', () => {
    test('should register file-menu event for m4a files', async () => {
      await plugin.onload();

      expect(mockApp.workspace.on).toHaveBeenCalledWith(
        'file-menu',
        expect.any(Function)
      );
    });

    test('should add settings tab on load', async () => {
      await plugin.onload();

      expect(plugin.addSettingTab).toHaveBeenCalled();
    });

    test('should load settings on startup', async () => {
      await plugin.onload();

      expect(plugin.loadData).toHaveBeenCalled();
      expect(plugin.settings).toEqual({ 
        openaiApiKey: 'test-key',
        saveFolderPath: 'Notes/Meetings',
        noteFilenameTemplate: '{{filename}}-{{date:YYYY-MM-DD}}',
        noteContentTemplate: '# Meeting\n\n{{summary}}'
      });
    });
  });

  describe('file menu integration', () => {
    let fileMenuHandler: (menu: MockMenu, file: MockTFile) => void;

    beforeEach(async () => {
      await plugin.onload();
      
      // Get the file-menu handler
      const workspaceOnCall = mockApp.workspace.on.mock.calls.find(
        call => call[0] === 'file-menu'
      );
      fileMenuHandler = workspaceOnCall![1];
    });

    test('should add menu item for m4a files', () => {
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('recording.m4a', 'm4a');

      fileMenuHandler(mockMenu as any, m4aFile as any);

      const items = mockMenu.getItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('ATTN: 요약 노트 생성하기');
      expect(items[0].icon).toBe('document');
    });

    test('should not add menu item for non-m4a files', () => {
      const mockMenu = new MockMenu();
      const txtFile = new MockTFile('document.txt', 'txt');

      fileMenuHandler(mockMenu as any, txtFile as any);

      const items = mockMenu.getItems();
      expect(items).toHaveLength(0);
    });

    test('should not add menu item for mp3 files', () => {
      const mockMenu = new MockMenu();
      const mp3File = new MockTFile('song.mp3', 'mp3');

      fileMenuHandler(mockMenu as any, mp3File as any);

      const items = mockMenu.getItems();
      expect(items).toHaveLength(0);
    });
  });

  describe('processAudioFile integration', () => {
    let fileMenuHandler: (menu: MockMenu, file: MockTFile) => void;
    const mockSummary = 'Test meeting summary';
    const mockTranscript = 'This is the full transcript of the meeting';

    beforeEach(async () => {
      await plugin.onload();
      
      // Setup successful API responses and template processing
      mockApiService.processAudioFile.mockResolvedValue(mockSummary);
      mockNoteCreator.createNote.mockResolvedValue();
      mockTemplateProcessor.process
        .mockReturnValueOnce('meeting-2025-09-02.md') // filename template result
        .mockReturnValueOnce('# Meeting\n\nTest meeting summary'); // content template result
      
      // Get the file-menu handler
      const workspaceOnCall = mockApp.workspace.on.mock.calls.find(
        call => call[0] === 'file-menu'
      );
      fileMenuHandler = workspaceOnCall![1];
    });

    test('should orchestrate full process: settings -> API -> templates -> note creation', async () => {
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('meeting.m4a', 'm4a');
      
      // Mock readBinary to simulate reading audio file
      mockApp.vault.readBinary = jest.fn().mockResolvedValue(new ArrayBuffer(1024));

      // Add menu item
      fileMenuHandler(mockMenu as any, m4aFile as any);
      
      // Click the menu item
      await mockMenu.clickItem('ATTN: 요약 노트 생성하기');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify the orchestration flow
      expect(ApiService).toHaveBeenCalledWith('test-key');
      expect(mockApiService.processAudioFile).toHaveBeenCalledWith(expect.any(File));
      expect(TemplateProcessor).toHaveBeenCalledTimes(1);
      expect(mockTemplateProcessor.process).toHaveBeenCalledTimes(2);
      expect(NoteCreator).toHaveBeenCalledWith(mockApp.vault);
      expect(mockNoteCreator.createNote).toHaveBeenCalledWith(
        'Notes/Meetings/meeting-2025-09-02.md',
        '# Meeting\n\nTest meeting summary'
      );
    });

    test('should use template settings for filename and content generation', async () => {
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('important-meeting.m4a', 'm4a');
      
      mockApp.vault.readBinary = jest.fn().mockResolvedValue(new ArrayBuffer(2048));

      fileMenuHandler(mockMenu as any, m4aFile as any);
      await mockMenu.clickItem('ATTN: 요약 노트 생성하기');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify template processor was called with correct templates and data
      expect(mockTemplateProcessor.process).toHaveBeenNthCalledWith(
        1,
        '{{filename}}-{{date:YYYY-MM-DD}}',
        expect.objectContaining({
          filename: 'important-meeting.m4a',
          summary: mockSummary
        })
      );
      
      expect(mockTemplateProcessor.process).toHaveBeenNthCalledWith(
        2,
        '# Meeting\n\n{{summary}}',
        expect.objectContaining({
          filename: 'important-meeting.m4a',
          summary: mockSummary
        })
      );
    });

    test('should construct full file path using saveFolderPath setting', async () => {
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('test.m4a', 'm4a');
      
      mockApp.vault.readBinary = jest.fn().mockResolvedValue(new ArrayBuffer(512));
      mockTemplateProcessor.process.mockReturnValueOnce('test-file.md');

      fileMenuHandler(mockMenu as any, m4aFile as any);
      await mockMenu.clickItem('ATTN: 요약 노트 생성하기');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockNoteCreator.createNote).toHaveBeenCalledWith(
        'Notes/Meetings/test-file.md',
        expect.any(String)
      );
    });

    test('should handle missing API key', async () => {
      // Override settings to have empty API key
      plugin.settings.openaiApiKey = '';
      
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('meeting.m4a', 'm4a');

      fileMenuHandler(mockMenu as any, m4aFile as any);
      
      // Mock console.error to capture error messages
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await mockMenu.clickItem('ATTN: 요약 노트 생성하기');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API 키가 설정되지 않았습니다')
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle API service errors', async () => {
      const apiError = new Error('API service failed');
      mockApiService.processAudioFile.mockRejectedValue(apiError);
      
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('meeting.m4a', 'm4a');

      fileMenuHandler(mockMenu as any, m4aFile as any);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await mockMenu.clickItem('ATTN: 요약 노트 생성하기');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('오디오 처리 중 오류'),
        apiError
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle note creation errors', async () => {
      const noteError = new Error('Note creation failed');
      mockNoteCreator.createNote.mockRejectedValue(noteError);
      
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('meeting.m4a', 'm4a');

      fileMenuHandler(mockMenu as any, m4aFile as any);
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await mockMenu.clickItem('ATTN: 요약 노트 생성하기');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockApiService.processAudioFile).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('오디오 처리 중 오류'),
        noteError
      );
      
      consoleSpy.mockRestore();
    });

    test('should support both transcript and summary placeholders in note template', async () => {
      // Clear previous mocks and set up fresh state
      jest.clearAllMocks();
      
      // Set plugin settings with API key
      plugin.settings = {
        openaiApiKey: 'test-key',
        saveFolderPath: 'Notes/Meetings',
        noteFilenameTemplate: '{{filename}}-{{date:YYYY-MM-DD}}',
        noteContentTemplate: '원문: {{transcript}}\n\n요약: {{summary}}'
      };
      
      await plugin.onload();
      
      // Mock ApiService to return both transcript and summary
      const mockResult = {
        transcript: '전체 STT 원문입니다.',
        summary: '요약된 내용입니다.'
      };
      mockApiService.processAudioFile.mockResolvedValue(mockResult);
      
      // Mock template processor to return the final content
      mockTemplateProcessor.process
        .mockReturnValueOnce('meeting-2025-09-02.md') // filename
        .mockReturnValueOnce('원문: 전체 STT 원문입니다.\n\n요약: 요약된 내용입니다.'); // content
      
      // Get the fresh file-menu handler
      const workspaceOnCall = mockApp.workspace.on.mock.calls.find(
        call => call[0] === 'file-menu'
      );
      const freshFileMenuHandler = workspaceOnCall![1];
      
      const mockMenu = new MockMenu();
      const m4aFile = new MockTFile('meeting.m4a', 'm4a');
      
      mockApp.vault.readBinary = jest.fn().mockResolvedValue(new ArrayBuffer(1024));

      freshFileMenuHandler(mockMenu as any, m4aFile as any);
      
      // Add console spy to catch errors
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await mockMenu.clickItem('ATTN: 요약 노트 생성하기');
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Check if there were any errors
      if (consoleSpy.mock.calls.length > 0) {
        console.log('Console errors:', consoleSpy.mock.calls);
      }
      
      consoleSpy.mockRestore();
      
      // Debug: Check what actually got called
      console.log('ApiService.processAudioFile calls:', mockApiService.processAudioFile.mock.calls);
      console.log('TemplateProcessor.process calls:', mockTemplateProcessor.process.mock.calls);
      console.log('NoteCreator.createNote calls:', mockNoteCreator.createNote.mock.calls);

      // Verify the basic flow worked
      expect(mockApiService.processAudioFile).toHaveBeenCalled();
      expect(mockTemplateProcessor.process).toHaveBeenCalledTimes(2);
      expect(mockNoteCreator.createNote).toHaveBeenCalled();

      // Verify template processor was called with both transcript and summary data
      expect(mockTemplateProcessor.process).toHaveBeenNthCalledWith(
        2, // content template call
        '원문: {{transcript}}\n\n요약: {{summary}}',
        expect.objectContaining({
          filename: 'meeting.m4a',
          transcript: '전체 STT 원문입니다.',
          summary: '요약된 내용입니다.'
        })
      );

      // Verify the final note content contains both transcript and summary
      expect(mockNoteCreator.createNote).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('전체 STT 원문입니다.')
      );
      expect(mockNoteCreator.createNote).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('요약된 내용입니다.')
      );
    });
  });

  describe('settings management', () => {
    test('should save settings correctly', async () => {
      plugin.settings = { openaiApiKey: 'new-key' };
      
      await plugin.saveSettings();

      expect(plugin.saveData).toHaveBeenCalledWith({ openaiApiKey: 'new-key' });
    });

    test('should load settings with defaults', async () => {
      plugin.loadData = jest.fn().mockResolvedValue({});
      
      await plugin.loadSettings();

      expect(plugin.settings).toEqual({ 
        openaiApiKey: '',
        saveFolderPath: '/',
        noteFilenameTemplate: '{{filename}}-회의록-{{date:YYYY-MM-DD}}',
        noteContentTemplate: '# 회의록\n\n**원본 파일:** {{filename}}\n**생성 날짜:** {{date:YYYY-MM-DD}}\n\n## 요약\n\n{{summary}}'
      });
    });

    test('should merge loaded settings with defaults', async () => {
      plugin.loadData = jest.fn().mockResolvedValue({ openaiApiKey: 'existing-key' });
      
      await plugin.loadSettings();

      expect(plugin.settings).toEqual({ 
        openaiApiKey: 'existing-key',
        saveFolderPath: '/',
        noteFilenameTemplate: '{{filename}}-회의록-{{date:YYYY-MM-DD}}',
        noteContentTemplate: '# 회의록\n\n**원본 파일:** {{filename}}\n**생성 날짜:** {{date:YYYY-MM-DD}}\n\n## 요약\n\n{{summary}}'
      });
    });
  });
});