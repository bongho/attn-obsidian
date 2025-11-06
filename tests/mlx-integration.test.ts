/**
 * MLX Whisper Integration Test
 *
 * Tests the complete MLX Whisper pipeline:
 * 1. Python environment check
 * 2. MlxBridge communication
 * 3. LocalMlxWhisperProvider transcription
 *
 * Run with: npx ts-node tests/mlx-integration.test.ts <audio-file-path>
 */

import { PythonEnvChecker } from '../src/utils/pythonEnvChecker';
import { MlxBridge } from '../src/utils/mlxBridge';
import { LocalMlxWhisperProvider } from '../src/providers/LocalMlxWhisperProvider';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function main() {
  console.log('='.repeat(60));
  console.log('MLX Whisper Integration Test');
  console.log('='.repeat(60));
  console.log();

  // Get audio file path from command line
  const audioFilePath = process.argv[2];

  if (!audioFilePath) {
    console.error('❌ Usage: npx ts-node tests/mlx-integration.test.ts <audio-file-path>');
    process.exit(1);
  }

  // Step 1: Check Python Environment
  console.log('📋 Step 1: Checking Python Environment');
  console.log('-'.repeat(60));

  const envChecker = PythonEnvChecker.getInstance();
  const envStatus = await envChecker.checkEnvironment();

  console.log(`Python Available: ${envStatus.pythonAvailable ? '✅' : '❌'}`);
  if (envStatus.pythonVersion) {
    console.log(`Python Version: ${envStatus.pythonVersion}`);
  }
  if (envStatus.pythonPath) {
    console.log(`Python Path: ${envStatus.pythonPath}`);
  }

  console.log(`Apple Silicon: ${envStatus.applesilicon ? '✅' : '❌'}`);
  console.log(`Platform: ${envStatus.platform}`);

  console.log(`mlx-whisper Available: ${envStatus.mlxWhisperAvailable ? '✅' : '❌'}`);
  if (envStatus.mlxWhisperVersion) {
    console.log(`mlx-whisper Version: ${envStatus.mlxWhisperVersion}`);
  }

  if (envStatus.issues.length > 0) {
    console.log('\n⚠️  Issues:');
    envStatus.issues.forEach(issue => console.log(`  - ${issue}`));
  }

  if (envStatus.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    envStatus.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }

  if (!envStatus.mlxWhisperAvailable) {
    console.log('\n❌ Cannot proceed without mlx-whisper. Exiting.');
    process.exit(1);
  }

  console.log();

  // Step 2: Test MlxBridge directly
  console.log('📋 Step 2: Testing MlxBridge Communication');
  console.log('-'.repeat(60));

  const bridge = new MlxBridge(envStatus.pythonPath || 'python3');

  try {
    console.log('Initializing MLX bridge...');
    await bridge.initialize();
    console.log('✅ Bridge initialized successfully');

    console.log('Testing ping...');
    const pingResult = await bridge.ping();
    console.log(`✅ Ping successful: ${pingResult}`);

    console.log('Loading model: mlx-community/whisper-medium-mlx...');
    await bridge.loadModel('mlx-community/whisper-medium-mlx');
    console.log('✅ Model loaded successfully');

  } catch (error) {
    console.error('❌ Bridge test failed:', error);
    await bridge.dispose();
    process.exit(1);
  }

  console.log();

  // Step 3: Test LocalMlxWhisperProvider
  console.log('📋 Step 3: Testing LocalMlxWhisperProvider');
  console.log('-'.repeat(60));

  try {
    console.log(`Reading audio file: ${audioFilePath}`);
    const audioBuffer = await readFile(audioFilePath);
    console.log(`✅ Audio file loaded: ${(audioBuffer.length / 1024).toFixed(2)} KB`);

    const provider = new LocalMlxWhisperProvider({
      provider: 'local-mlx',
      model: 'mlx-community/whisper-medium-mlx',
      language: 'ko'
    });

    console.log('\nTranscribing audio...');
    const startTime = Date.now();

    const result = await provider.transcribe(audioBuffer, {
      format: 'verbose_json',
      language: 'ko',
      model: 'mlx-community/whisper-medium-mlx'
    });

    const duration = (Date.now() - startTime) / 1000;

    console.log('\n✅ Transcription Complete!');
    console.log('-'.repeat(60));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Audio Length: ${result.duration?.toFixed(2)}s`);
    console.log(`Language: ${result.language}`);
    console.log(`Segments: ${result.segments?.length || 0}`);
    console.log('\nTranscription Text:');
    console.log('-'.repeat(60));
    console.log(result.text);
    console.log('-'.repeat(60));

    if (result.segments && result.segments.length > 0) {
      console.log('\nFirst 3 Segments:');
      console.log('-'.repeat(60));
      result.segments.slice(0, 3).forEach((seg, idx) => {
        console.log(`[${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s] ${seg.text}`);
      });
    }

    // Calculate performance metrics
    if (result.duration) {
      const speedup = result.duration / duration;
      console.log('\n📊 Performance Metrics:');
      console.log('-'.repeat(60));
      console.log(`Audio Duration: ${result.duration.toFixed(2)}s`);
      console.log(`Processing Time: ${duration.toFixed(2)}s`);
      console.log(`Speed: ${speedup.toFixed(2)}x realtime`);
    }

    // Cleanup
    await provider.dispose();
    console.log('\n✅ Provider disposed successfully');

  } catch (error) {
    console.error('\n❌ Provider test failed:', error);
    process.exit(1);
  }

  // Cleanup bridge
  await bridge.dispose();

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests passed!');
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
