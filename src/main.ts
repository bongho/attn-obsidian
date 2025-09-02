import { App, Plugin, PluginSettingTab, TFile, Notice } from 'obsidian';
import { ATTNSettings } from './types';
import { ATTNSettingTab } from './settings';
import { ApiService } from './apiService';
import { NoteCreator } from './noteCreator';
import { TemplateProcessor } from './templateProcessor';

const DEFAULT_SETTINGS: ATTNSettings = {
  openaiApiKey: '',
  saveFolderPath: '/',
  noteFilenameTemplate: '{{filename}}-회의록-{{date:YYYY-MM-DD}}',
  noteContentTemplate: '# 회의록\n\n**원본 파일:** {{filename}}\n**생성 날짜:** {{date:YYYY-MM-DD}}\n\n## 요약\n\n{{summary}}'
};

export default class ATTNPlugin extends Plugin {
  settings: ATTNSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new ATTNSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'm4a') {
          menu.addItem((item) => {
            item
              .setTitle('ATTN: 노트 생성하기')
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
      // Check if API key is configured
      if (!this.settings.openaiApiKey || this.settings.openaiApiKey.trim() === '') {
        new Notice('OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.');
        console.error('API 키가 설정되지 않았습니다.');
        return;
      }

      // Show progress notice
      const processingNotice = new Notice('오디오 파일을 처리하고 있습니다...', 0);

      // Step 1: Read and process audio file with API service
      const audioData = await this.app.vault.readBinary(file);
      const audioFile = new File([audioData], file.name, { type: 'audio/m4a' });

      const apiService = new ApiService(this.settings.openaiApiKey);
      const summary = await apiService.processAudioFile(audioFile);

      // Step 2: Prepare template data
      const templateData = {
        filename: file.name,
        summary: summary,
        // transcript: transcript, // TODO: ApiService should return both summary and transcript
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