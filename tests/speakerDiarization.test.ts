import { SpeakerDiarizationService } from '../src/speakerDiarization';
import { DiarizationSettings, VerboseTranscriptionResult } from '../src/types';

// Mock modules
const mockExecAsync = jest.fn();
jest.mock('child_process', () => ({
  exec: jest.fn()
}));
jest.mock('util', () => ({
  promisify: () => mockExecAsync
}));
jest.mock('fs');

describe('SpeakerDiarizationService', () => {
  let service: SpeakerDiarizationService;
  let settings: DiarizationSettings;

  beforeEach(() => {
    settings = {
      enabled: true,
      provider: 'pyannote',
      minSpeakers: 1,
      maxSpeakers: 5,
      apiKey: 'test_key',
      mergeThreshold: 1.0
    };
    service = new SpeakerDiarizationService(settings);
    jest.clearAllMocks();
    mockExecAsync.mockClear();
  });

  describe('enhanceTranscriptionWithSpeakers', () => {
    test('should return original transcription when diarization is disabled', async () => {
      settings.enabled = false;
      service = new SpeakerDiarizationService(settings);

      const transcription: VerboseTranscriptionResult = {
        text: 'Hello world',
        segments: [
          { id: 0, start: 0, end: 2, text: 'Hello world' }
        ]
      };

      const result = await service.enhanceTranscriptionWithSpeakers(transcription, 'test.wav');
      expect(result).toBe(transcription);
    });

    test('should assign speakers to segments when diarization succeeds', async () => {
      const mockDiarizationResult = [
        { start: 0, end: 5, speaker: { id: 'speaker_1', label: 'Speaker 1' } },
        { start: 5, end: 10, speaker: { id: 'speaker_2', label: 'Speaker 2' } }
      ];

      // Mock Python script execution for pyannote
      mockExecAsync.mockResolvedValue({ 
        stdout: JSON.stringify([
          { start: 0, end: 5, speaker: 'speaker_1' },
          { start: 5, end: 10, speaker: 'speaker_2' }
        ])
      });

      const transcription: VerboseTranscriptionResult = {
        text: 'Hello world. How are you?',
        segments: [
          { id: 0, start: 0, end: 2, text: 'Hello world.' },
          { id: 1, start: 6, end: 8, text: 'How are you?' }
        ]
      };

      const result = await service.enhanceTranscriptionWithSpeakers(transcription, 'test.wav');

      expect(result.speakers).toBeDefined();
      expect(result.speakers?.length).toBe(2);
      expect(result.speakerSegments).toBeDefined();
      expect(result.segments[0].speaker).toBeDefined();
      expect(result.segments[0].speaker?.label).toBe('Speaker 1');
    });

    test('should handle diarization failures gracefully', async () => {
      mockExecAsync.mockRejectedValue(new Error('Diarization failed'));

      const transcription: VerboseTranscriptionResult = {
        text: 'Hello world',
        segments: [
          { id: 0, start: 0, end: 2, text: 'Hello world' }
        ]
      };

      const result = await service.enhanceTranscriptionWithSpeakers(transcription, 'test.wav');
      
      // Should return original transcription on failure
      expect(result).toBe(transcription);
    });
  });

  describe('provider support', () => {
    test('should handle local provider', async () => {
      settings.provider = 'local';
      service = new SpeakerDiarizationService(settings);

      const mockFile = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const segments = await service.diarizeAudio(mockFile);

      // Local provider should return mock data
      expect(segments).toBeDefined();
      expect(Array.isArray(segments)).toBe(true);
    });

    test('should handle whisperx provider', async () => {
      settings.provider = 'whisperx';
      service = new SpeakerDiarizationService(settings);

      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify({
          segments: [
            { start: 0, end: 5, speaker: 'SPEAKER_00', text: 'Hello' },
            { start: 5, end: 10, speaker: 'SPEAKER_01', text: 'World' }
          ]
        })
      });

      const mockFile = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      const segments = await service.diarizeAudio(mockFile);

      expect(segments).toBeDefined();
      expect(segments.length).toBe(2);
      expect(segments[0].speaker.label).toBe('Speaker 00');
    });
  });

  describe('speaker assignment', () => {
    test('should correctly assign speakers based on time overlap', async () => {
      const speakerSegments = [
        { start: 0, end: 3, speaker: { id: 'spk1', label: 'Speaker 1' } },
        { start: 3, end: 6, speaker: { id: 'spk2', label: 'Speaker 2' } }
      ];

      const transcriptionSegments = [
        { id: 0, start: 1, end: 2, text: 'Hello' },
        { id: 1, start: 4, end: 5, text: 'World' }
      ];

      // @ts-ignore - accessing private method for testing
      const result = service.assignSpeakersToSegments(transcriptionSegments, speakerSegments);

      expect(result[0].speaker?.label).toBe('Speaker 1');
      expect(result[1].speaker?.label).toBe('Speaker 2');
    });

    test('should handle segments with no speaker overlap', async () => {
      const speakerSegments = [
        { start: 0, end: 1, speaker: { id: 'spk1', label: 'Speaker 1' } }
      ];

      const transcriptionSegments = [
        { id: 0, start: 5, end: 6, text: 'Hello' }
      ];

      // @ts-ignore - accessing private method for testing
      const result = service.assignSpeakersToSegments(transcriptionSegments, speakerSegments);

      expect(result[0].speaker).toBeUndefined();
    });
  });
});