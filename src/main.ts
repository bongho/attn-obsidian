import { App, Plugin, PluginSettingTab, TFile, Notice } from 'obsidian';
import { ATTNSettings, AudioSpeedOption } from './types';
import { ATTNSettingTab } from './settings';
import { ApiService } from './apiService';
import { NoteCreator } from './noteCreator';
import { TemplateProcessor } from './templateProcessor';
import { ConfigLoader } from './configLoader';
import { AudioProcessor } from './audioProcessor';

const DEFAULT_SETTINGS: ATTNSettings = {
  openaiApiKey: '',
  saveFolderPath: '/',
  noteFilenameTemplate: '{{date:YYYY-MM-DD}}-{{filename}}-회의록',
  noteContentTemplate: '# 회의록\n\n**원본 파일:** {{filename}}\n**생성 날짜:** {{date:YYYY-MM-DD}}\n\n## 요약\n\n{{summary}}',
  audioSpeedMultiplier: 1,
  ffmpegPath: ''
};

export default class ATTNPlugin extends Plugin {
  settings: ATTNSettings;
  private configLoader: ConfigLoader;

  async onload() {
    this.configLoader = ConfigLoader.getInstance();
    await this.loadSettings();

    this.addSettingTab(new ATTNSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'm4a') {
          menu.addItem((item) => {
            item
              .setTitle('ATTN: 요약 노트 생성하기')
              .setIcon('document')
              .onClick(async () => {
                await this.processAudioFile(file);
              });
          });
        }
      })
    );
  }

  onunload() {

  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async processAudioFile(file: TFile) {
    try {
      // Check if API key is configured (from config file or settings)
      const configApiKey = this.configLoader.getOpenAIApiKey();
      const finalApiKey = configApiKey || this.settings.openaiApiKey;
      
      if (!finalApiKey || finalApiKey.trim() === '') {
        new Notice('OpenAI API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.');
        console.error('API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.');
        return;
      }

      if (this.configLoader.isDebugMode()) {
        console.log('🔧 ATTN Debug: Processing audio file:', file.name);
        console.log('🔧 ATTN Debug: Config file path:', this.configLoader.getConfigPath());
      }

      // Show progress notice
      const processingNotice = new Notice('오디오 파일을 처리하고 있습니다...', 0);

      // Step 1: Read audio file
      const audioData = await this.app.vault.readBinary(file);
      let audioFile = new File([audioData], file.name, { type: 'audio/m4a' });

      // Step 2: Process audio speed if necessary
      if (this.settings.audioSpeedMultiplier > 1) {
        try {
          processingNotice.setMessage(`오디오 속도 처리 중... (${this.settings.audioSpeedMultiplier}배속)`);
          const audioProcessor = new AudioProcessor(this.settings.ffmpegPath);
          
          // Check if ffmpeg is available
          const ffmpegAvailable = await audioProcessor.checkFFmpegAvailability();
          if (!ffmpegAvailable) {
            new Notice('⚠️ FFmpeg를 찾을 수 없습니다. 설정에서 FFmpeg 경로를 확인하거나 원본 속도로 처리합니다.');
            console.warn('FFmpeg not available at configured path, processing at original speed');
          } else {
            audioFile = await audioProcessor.processAudioSpeed(audioFile, this.settings.audioSpeedMultiplier as AudioSpeedOption);
            if (this.configLoader.isDebugMode()) {
              console.log(`🔧 ATTN Debug: Audio processed at ${this.settings.audioSpeedMultiplier}x speed`);
            }
          }
        } catch (error) {
          console.warn('Audio speed processing failed, using original file:', error);
          new Notice('⚠️ 오디오 속도 처리 실패, 원본으로 진행합니다.');
        }
      }

      // Step 3: Process with API service
      processingNotice.setMessage('음성 인식 및 요약 생성 중...');
      const apiService = new ApiService(finalApiKey);
      const result = await apiService.processAudioFile(audioFile);

      // Step 2: Prepare template data
      const templateData = {
        filename: file.name,
        transcript: result.transcript,
        summary: result.summary,
      };

      // Step 3: Process templates using TemplateProcessor
      const templateProcessor = new TemplateProcessor();
      
      // Generate filename using template
      const generatedFileName = templateProcessor.process(
        this.settings.noteFilenameTemplate,
        templateData
      );
      
      // Generate content using template
      const generatedContent = templateProcessor.process(
        this.settings.noteContentTemplate,
        templateData
      );

      // Step 4: Construct full file path
      let fullPath: string;
      if (this.settings.saveFolderPath === '/' || this.settings.saveFolderPath === '') {
        fullPath = `${generatedFileName}.md`;
      } else {
        // Remove leading/trailing slashes and ensure proper format
        const cleanFolderPath = this.settings.saveFolderPath.replace(/^\/+|\/+$/g, '');
        fullPath = `${cleanFolderPath}/${generatedFileName}.md`;
      }

      // Step 5: Create the note
      const noteCreator = new NoteCreator(this.app.vault);
      await noteCreator.createNote(fullPath, generatedContent);

      // Hide progress notice and show success
      processingNotice.hide();
      new Notice(`회의록이 성공적으로 생성되었습니다: ${fullPath}`);

    } catch (error) {
      console.error('오디오 처리 중 오류:', error);
      
      let errorMessage = '오디오 처리 중 오류가 발생했습니다.';
      if (error instanceof Error) {
        errorMessage += ` ${error.message}`;
      }
      
      new Notice(errorMessage);
    }
  }
}