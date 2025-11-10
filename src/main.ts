import { App, Plugin, PluginSettingTab, TFile, Notice } from 'obsidian';
import { ATTNSettings, AudioSpeedOption, VerboseTranscriptionResult, TranscriptionSegment, Speaker } from './types';
import { ATTNSettingTab } from './settings';
import { ApiService } from './apiService';
import { NoteCreator } from './noteCreator';
import { TemplateProcessor } from './templateProcessor';
import { ConfigLoader } from './configLoader';
import { AudioProcessor } from './audioProcessor';
import { TemplateLoader } from './templateLoader';
import { join } from 'path';

const DEFAULT_SETTINGS: ATTNSettings = {
  openaiApiKey: '', // Legacy field for backward compatibility
  saveFolderPath: '/',
  noteFilenameTemplate: '{{date:YYYY-MM-DD}}-{{filename}}-회의록',
  noteContentTemplate: `# 🎯 {{date:YYYY-MM-DD}} 회의록

## 📄 기본 정보
- **파일:** {{filename}}
- **생성일:** {{date:YYYY-MM-DD HH:mm:ss}}
{{#if speakers}}
- **참석자:** {{speakers}}
{{/if}}

---

## 📋 회의 요약

{{summary}}

---

## 🎙️ 전체 대화 내용

{{#if speakerTranscript}}
{{speakerTranscript}}
{{else}}
{{transcript}}
{{/if}}

---

*🤖 이 회의록은 ATTN(Audio Transcription and Summarization)에 의해 자동 생성되었습니다.*`,
  noteContentTemplateFile: '',
  useTemplateFile: false,
  systemPrompt: `당신은 1시간 회의록 전문 요약 시스템입니다. 다음 구조로 회의 내용을 분석하고 요약해주세요:

## 회의 개요
- 참석자 및 발언 시간 분석
- 주요 안건 및 논의 흐름

## 핵심 내용 요약
- 각 안건별 주요 논의점
- 중요한 의견 및 관점들
- 논의 과정에서 나온 문제점과 해결방안

## 의사결정 사항
- 확정된 결정 내용
- 결정에 이르는 과정과 근거
- 보류되거나 추가 검토가 필요한 사항

## 액션 아이템
- 담당자별 할 일 정리
- 일정 및 마감일
- 후속 회의 계획

## 다음 단계
- 향후 진행 방향
- 필요한 준비사항
- 관련 이해관계자들

회의의 전체적인 맥락과 흐름을 고려하여 일관성 있게 정리해주시고, 중요도에 따라 우선순위를 매겨서 제시해주세요.`,
  audioSpeedMultiplier: 1,
  ffmpegPath: '',
  stt: {
    provider: 'openai',
    model: 'whisper-1',
    language: 'ko',
    whisperBackend: 'faster-whisper-cpp',
    whisperModelPathOrName: 'base'
  },
  summary: {
    provider: 'openai',
    model: 'gpt-4'
  },
  processing: {
    enableChunking: true,
    maxUploadSizeMB: 23, // Conservative limit to prevent 413 errors (accounting for FormData overhead)
    maxChunkDurationSec: 150, // Increased for better context (2.5 minutes)
    targetSampleRateHz: 16000,
    targetChannels: 1,
    silenceThresholdDb: -30, // More sensitive for meeting audio
    minSilenceMs: 800, // Longer pauses typical in meetings
    hardSplitWindowSec: 45, // Increased for better natural breaks
    preserveIntermediates: false,
    contextOverlapSec: 10, // New: Context preservation between chunks
    apiTimeoutMs: 120000, // 2 minutes timeout for API requests
    diarization: {
      enabled: true, // 회의록에서 화자 분리는 중요하므로 기본 활성화
      provider: 'pyannote',
      minSpeakers: 2, // 회의는 보통 2명 이상
      maxSpeakers: 8, // 대부분의 회의는 8명 이하
      mergeThreshold: 2.0 // 회의에서는 더 관대한 병합 임계값
    }
  },
  logging: {
    enabled: true,
    level: 'error',
    maxLogFileBytes: 5 * 1024 * 1024,
    maxLogFiles: 5
  }
};

export default class ATTNPlugin extends Plugin {
  settings: ATTNSettings;
  private configLoader: ConfigLoader;
  mlxBridge?: import('./utils/mlxBridge').MlxBridge;

  /**
   * Get the path to MLX bridge Python script in plugin directory
   */
  getMlxBridgeScriptPath(): string {
    const adapter = this.app.vault.adapter as any;
    const pluginDir = join(adapter.basePath, '.obsidian', 'plugins', this.manifest.id);
    return join(pluginDir, 'python', 'mlx_whisper_bridge.py');
  }

  async onload() {
    this.configLoader = ConfigLoader.getInstance();
    await this.loadSettings();

    // Set runtime paths for MLX bridge
    this.settings._mlxBridgeScriptPath = this.getMlxBridgeScriptPath();

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
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    
    // Migration logic for backward compatibility
    await this.migrateSettings(loadedData);
  }

  private async migrateSettings(loadedData: any) {
    let needsSave = false;

    // If old openaiApiKey exists but new structure doesn't, migrate it
    if (loadedData?.openaiApiKey && 
        (!loadedData.stt || !loadedData.summary)) {
      
      // Migrate STT settings
      if (!this.settings.stt.apiKey && loadedData.openaiApiKey) {
        this.settings.stt.apiKey = loadedData.openaiApiKey;
        needsSave = true;
      }
      
      // Migrate Summary settings  
      if (!this.settings.summary.apiKey && loadedData.openaiApiKey) {
        this.settings.summary.apiKey = loadedData.openaiApiKey;
        needsSave = true;
      }
    }

    // Add missing processing settings for existing users
    if (!loadedData?.processing) {
      this.settings.processing = DEFAULT_SETTINGS.processing;
      needsSave = true;
    }

    // Add missing logging settings for existing users
    if (!loadedData?.logging) {
      this.settings.logging = DEFAULT_SETTINGS.logging;
      needsSave = true;
    }

    if (needsSave) {
      await this.saveSettings();
    }
  }

  private validateApiKeys(): boolean {
    const configApiKey = this.configLoader.getOpenAIApiKey();
    
    // Check STT provider requirements
    if (this.settings.stt.provider === 'openai' || this.settings.stt.provider === 'gemini') {
      const sttApiKey = this.settings.stt.apiKey || this.settings.openaiApiKey || configApiKey;
      if (!sttApiKey || sttApiKey.trim() === '') {
        new Notice(`${this.settings.stt.provider.toUpperCase()} STT API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.`);
        console.error(`${this.settings.stt.provider.toUpperCase()} STT API 키가 설정되지 않았습니다.`);
        return false;
      }
    }

    // Check local whisper requirements
    if (this.settings.stt.provider === 'local-whisper') {
      if (!this.settings.stt.ollamaEndpoint && !this.settings.stt.whisperBinaryPath) {
        new Notice('Local Whisper 사용을 위해서는 Ollama 엔드포인트 또는 Whisper 바이너리 경로를 설정해주세요.');
        console.error('Local Whisper 설정이 완료되지 않았습니다.');
        return false;
      }
    }

    // Check Summary provider requirements
    if (this.settings.summary.provider === 'openai' || this.settings.summary.provider === 'gemini') {
      const summaryApiKey = this.settings.summary.apiKey || this.settings.openaiApiKey || configApiKey;
      if (!summaryApiKey || summaryApiKey.trim() === '') {
        new Notice(`${this.settings.summary.provider.toUpperCase()} Summary API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.`);
        console.error(`${this.settings.summary.provider.toUpperCase()} Summary API 키가 설정되지 않았습니다.`);
        return false;
      }
    }

    // Check local LLM requirements
    if (this.settings.summary.provider === 'local-llm') {
      if (!this.settings.summary.ollamaEndpoint) {
        new Notice('Local LLM 사용을 위해서는 Ollama 엔드포인트를 설정해주세요.');
        console.error('Local LLM 설정이 완료되지 않았습니다.');
        return false;
      }
    }

    return true;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async processAudioFile(file: TFile) {
    try {
      // Check if required API keys are configured based on provider selection
      const hasRequiredKeys = this.validateApiKeys();
      
      if (!hasRequiredKeys) {
        return; // validateApiKeys will show appropriate error notice
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

      // Step 3: Process with API service using new provider system
      processingNotice.setMessage('음성 인식 및 요약 생성 중...');
      const apiService = new ApiService(this.settings);
      const result = await apiService.processAudioFile(audioFile, this.settings.systemPrompt);

      // Step 4: Prepare template data
      const templateData = {
        filename: file.name,
        transcript: result.transcript,
        summary: result.summary,
        speakers: this.formatSpeakers(result.transcriptionResult),
        speakerTranscript: this.formatSpeakerTranscript(result.transcriptionResult),
      };

      // Step 5: Process templates using TemplateProcessor and TemplateLoader
      const templateProcessor = new TemplateProcessor();
      const templateLoader = new TemplateLoader(this.app.vault);
      
      // Generate filename using template
      const generatedFileName = templateProcessor.process(
        this.settings.noteFilenameTemplate,
        templateData
      );
      
      // Load content template (from file or fallback to inline template)
      processingNotice.setMessage('템플릿 처리 중...');
      const contentTemplate = await templateLoader.getTemplateContent(
        this.settings.useTemplateFile,
        this.settings.noteContentTemplateFile,
        this.settings.noteContentTemplate
      );
      
      // Generate content using template
      const generatedContent = templateProcessor.process(
        contentTemplate,
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

  /**
   * Format speakers list for template
   */
  private formatSpeakers(transcriptionResult: VerboseTranscriptionResult): string {
    if (!transcriptionResult.speakers || transcriptionResult.speakers.length === 0) {
      return '';
    }

    return transcriptionResult.speakers
      .map((speaker) => `- ${speaker.label}`)
      .join('\n');
  }

  /**
   * Format transcript with speaker labels for template
   */
  private formatSpeakerTranscript(transcriptionResult: VerboseTranscriptionResult): string {
    if (!transcriptionResult.segments) {
      return transcriptionResult.text || '';
    }

    const groupedSegments = this.groupSegmentsBySpeaker(transcriptionResult.segments);
    
    return groupedSegments
      .map(group => {
        const speakerLabel = group.speaker ? `**${group.speaker.label}:** ` : '';
        return `${speakerLabel}${group.text}`;
      })
      .join('\n\n');
  }

  /**
   * Group consecutive segments by the same speaker
   */
  private groupSegmentsBySpeaker(segments: TranscriptionSegment[]): Array<{speaker: Speaker | undefined, text: string}> {
    const groups: Array<{speaker: Speaker | undefined, text: string}> = [];
    let currentGroup: {speaker: Speaker | undefined, text: string} | null = null;

    for (const segment of segments) {
      if (!currentGroup ||
          (currentGroup.speaker?.id !== segment.speaker?.id)) {
        // New speaker or no previous group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          speaker: segment.speaker,
          text: segment.text
        };
      } else {
        // Same speaker, append text
        currentGroup.text += ' ' + segment.text;
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }
}