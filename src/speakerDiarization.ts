import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { 
  Speaker, 
  SpeakerSegment, 
  VerboseTranscriptionResult, 
  DiarizationSettings, 
  TranscriptionSegment 
} from './types';

const execAsync = promisify(exec);

export class SpeakerDiarizationService {
  private tempDir: string;
  private settings: DiarizationSettings;
  private pythonCommand: string | null = null;

  constructor(settings: DiarizationSettings) {
    this.settings = settings;
    this.tempDir = join(tmpdir(), 'attn-diarization');
    this.ensureTempDir();
  }

  private async findPythonCommand(): Promise<string | null> {
    if (this.pythonCommand) {
      return this.pythonCommand;
    }

    const candidates = ['python3', 'python', '/usr/bin/python3', '/usr/bin/python', '/usr/local/bin/python3'];
    
    for (const candidate of candidates) {
      try {
        await execAsync(`${candidate} --version`);
        console.log(`Found Python at: ${candidate}`);
        this.pythonCommand = candidate;
        return candidate;
      } catch (error) {
        continue;
      }
    }
    
    console.warn('No Python installation found. Available commands:', candidates.join(', '));
    return null;
  }

  async diarizeAudio(audioFile: File | Buffer | string): Promise<SpeakerSegment[]> {
    if (!this.settings.enabled) {
      return [];
    }

    switch (this.settings.provider) {
      case 'pyannote':
        return this.diarizeWithPyannote(audioFile);
      case 'whisperx':
        return this.diarizeWithWhisperX(audioFile);
      case 'local':
        return this.diarizeWithLocal(audioFile);
      default:
        console.warn('No diarization provider configured');
        return [];
    }
  }

  async enhanceTranscriptionWithSpeakers(
    transcription: VerboseTranscriptionResult,
    audioFile: File | Buffer | string
  ): Promise<VerboseTranscriptionResult> {
    if (!this.settings.enabled) {
      return transcription;
    }

    try {
      console.log('Starting speaker diarization...');
      const speakerSegments = await this.diarizeAudio(audioFile);
      
      if (speakerSegments.length === 0) {
        console.warn('No speaker segments detected');
        return transcription;
      }

      // Extract unique speakers
      const speakers = this.extractSpeakers(speakerSegments);
      
      // Assign speakers to transcription segments
      const enhancedSegments = this.assignSpeakersToSegments(transcription.segments, speakerSegments);
      
      // Assign speakers to words if available
      const enhancedSegmentsWithWords = this.assignSpeakersToWords(enhancedSegments, speakerSegments);

      console.log(`Diarization completed: ${speakers.length} speakers detected`);

      return {
        ...transcription,
        segments: enhancedSegmentsWithWords,
        speakers,
        speakerSegments
      };
    } catch (error) {
      console.error('Speaker diarization failed:', error);
      return transcription;
    }
  }

  private async diarizeWithPyannote(audioFile: File | Buffer | string): Promise<SpeakerSegment[]> {
    // Check if Python and pyannote are available before proceeding
    const pythonCommand = await this.findPythonCommand();
    if (!pythonCommand) {
      console.warn('Python not found, disabling speaker diarization');
      return [];
    }

    // Check if pyannote.audio is installed
    const hasPyannote = await this.checkPyannoteInstallation(pythonCommand);
    if (!hasPyannote) {
      console.warn('🎤 pyannote.audio not installed. Speaker diarization disabled.');
      console.warn('🎤 To enable speaker diarization, install pyannote.audio:');
      console.warn('🎤 pip install pyannote.audio');
      return [];
    }

    console.log(`Using Python command: ${pythonCommand}`);
    
    const audioPath = await this.prepareAudioFile(audioFile);
    
    try {
      // Example Python script call to pyannote
      const pythonScript = `
import sys
import json
try:
    from pyannote.audio import Pipeline
except ImportError:
    print(json.dumps({"error": "pyannote.audio not installed"}), file=sys.stderr)
    sys.exit(1)

try:
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization", 
                                       use_auth_token="${this.settings.apiKey}")
    
    diarization = pipeline("${audioPath}")
    
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "start": turn.start,
            "end": turn.end,
            "speaker": speaker
        })
    
    print(json.dumps(segments))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
      `;
      
      const scriptPath = join(this.tempDir, `diarize_${Date.now()}.py`);
      writeFileSync(scriptPath, pythonScript);
      
      const { stdout, stderr } = await execAsync(`${pythonCommand} "${scriptPath}"`);
      
      if (stderr && stderr.includes('error')) {
        console.warn('Pyannote script error:', stderr);
        return [];
      }
      
      let segments;
      try {
        segments = JSON.parse(stdout);
      } catch (parseError) {
        console.error('Failed to parse diarization output:', stdout);
        return [];
      }
      
      // Check for error response
      if (segments.error) {
        console.error('Pyannote error:', segments.error);
        return [];
      }
      
      // Clean up
      unlinkSync(scriptPath);
      if (typeof audioFile !== 'string') {
        unlinkSync(audioPath);
      }
      
      return segments.map((seg: any, index: number) => ({
        start: seg.start,
        end: seg.end,
        speaker: {
          id: seg.speaker,
          label: `Speaker ${this.getSpeakerNumber(seg.speaker)}`
        }
      }));
    } catch (error) {
      console.error('Pyannote diarization failed:', error);
      return [];
    }
  }

  private async checkPyannoteInstallation(pythonCommand: string): Promise<boolean> {
    try {
      await execAsync(`${pythonCommand} -c "import pyannote.audio"`);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async diarizeWithWhisperX(audioFile: File | Buffer | string): Promise<SpeakerSegment[]> {
    // Implementation for WhisperX diarization
    const audioPath = await this.prepareAudioFile(audioFile);
    
    try {
      const command = `whisperx "${audioPath}" --diarize --hf_token ${this.settings.apiKey} --output_format json`;
      const { stdout } = await execAsync(command);
      
      // Parse WhisperX output and convert to our format
      const result = JSON.parse(stdout);
      
      // Clean up temp file
      if (typeof audioFile !== 'string') {
        unlinkSync(audioPath);
      }
      
      return this.parseWhisperXOutput(result);
    } catch (error) {
      console.error('WhisperX diarization failed:', error);
      return [];
    }
  }

  private async diarizeWithLocal(audioFile: File | Buffer | string): Promise<SpeakerSegment[]> {
    // Simple local implementation - could use local models or basic voice activity detection
    console.warn('Local diarization not fully implemented, returning mock data');
    
    // Mock implementation - in reality this would use local ML models
    return [{
      start: 0,
      end: 60,
      speaker: {
        id: 'speaker_1',
        label: 'Speaker 1'
      }
    }];
  }

  private async prepareAudioFile(audioFile: File | Buffer | string): Promise<string> {
    if (typeof audioFile === 'string') {
      return audioFile;
    }

    const fileName = `audio_${Date.now()}.wav`;
    const filePath = join(this.tempDir, fileName);

    if (audioFile instanceof File) {
      const buffer = Buffer.from(await audioFile.arrayBuffer());
      writeFileSync(filePath, buffer);
    } else {
      writeFileSync(filePath, audioFile);
    }

    return filePath;
  }

  private extractSpeakers(speakerSegments: SpeakerSegment[]): Speaker[] {
    const speakerMap = new Map<string, Speaker>();
    
    speakerSegments.forEach(segment => {
      if (!speakerMap.has(segment.speaker.id)) {
        speakerMap.set(segment.speaker.id, segment.speaker);
      }
    });
    
    return Array.from(speakerMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  private assignSpeakersToSegments(
    transcriptionSegments: TranscriptionSegment[], 
    speakerSegments: SpeakerSegment[]
  ): TranscriptionSegment[] {
    return transcriptionSegments.map(segment => {
      const overlappingSpeaker = this.findOverlappingSpeaker(segment, speakerSegments);
      return {
        ...segment,
        speaker: overlappingSpeaker
      };
    });
  }

  private assignSpeakersToWords(
    segments: TranscriptionSegment[], 
    speakerSegments: SpeakerSegment[]
  ): TranscriptionSegment[] {
    return segments.map(segment => ({
      ...segment,
      words: segment.words?.map(word => ({
        ...word,
        speaker: this.findOverlappingSpeaker(word, speakerSegments)
      }))
    }));
  }

  private findOverlappingSpeaker(
    timeSegment: { start: number; end: number }, 
    speakerSegments: SpeakerSegment[]
  ): Speaker | undefined {
    // Find speaker segment with maximum overlap
    let maxOverlap = 0;
    let bestSpeaker: Speaker | undefined;

    speakerSegments.forEach(speakerSeg => {
      const overlapStart = Math.max(timeSegment.start, speakerSeg.start);
      const overlapEnd = Math.min(timeSegment.end, speakerSeg.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSpeaker = speakerSeg.speaker;
      }
    });

    return bestSpeaker;
  }

  private parseWhisperXOutput(result: any): SpeakerSegment[] {
    // Parse WhisperX specific output format
    if (!result.segments) return [];
    
    return result.segments
      .filter((seg: any) => seg.speaker)
      .map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        speaker: {
          id: seg.speaker,
          label: `Speaker ${this.getSpeakerNumber(seg.speaker)}`
        }
      }));
  }

  private getSpeakerNumber(speakerId: string): string {
    // Extract number from speaker ID or assign sequential numbers
    const match = speakerId.match(/\d+/);
    return match ? match[0] : speakerId.replace(/\D/g, '') || '1';
  }

  private ensureTempDir(): void {
    if (!existsSync(this.tempDir)) {
      require('fs').mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private mergeSimilarSpeakers(segments: SpeakerSegment[]): SpeakerSegment[] {
    if (!this.settings.mergeThreshold) return segments;

    const merged: SpeakerSegment[] = [];
    let current: SpeakerSegment | null = null;

    for (const segment of segments.sort((a, b) => a.start - b.start)) {
      if (!current) {
        current = { ...segment };
        continue;
      }

      // Check if same speaker and gap is small enough to merge
      if (
        current.speaker.id === segment.speaker.id &&
        segment.start - current.end <= this.settings.mergeThreshold
      ) {
        // Merge segments
        current.end = segment.end;
      } else {
        // Different speaker or gap too large, finalize current and start new
        merged.push(current);
        current = { ...segment };
      }
    }

    if (current) {
      merged.push(current);
    }

    return merged;
  }
}