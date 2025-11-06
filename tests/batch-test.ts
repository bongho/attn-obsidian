/**
 * MLX Whisper Batch Processing Test
 *
 * Tests the new batch transcription feature for 2-4x speedup
 *
 * Run with: npx ts-node tests/batch-test.ts <audio-file-1> <audio-file-2> ...
 */

import { MlxBridge } from '../src/utils/mlxBridge';
import { PythonEnvChecker } from '../src/utils/pythonEnvChecker';

async function main() {
  console.log('='.repeat(60));
  console.log('MLX Whisper Batch Processing Test');
  console.log('='.repeat(60));
  console.log();

  // Get audio file paths from command line
  const audioFiles = process.argv.slice(2);

  if (audioFiles.length < 2) {
    console.error('❌ Usage: npx ts-node tests/batch-test.ts <audio-file-1> <audio-file-2> ...');
    console.error('   Provide at least 2 audio files to test batch processing');
    process.exit(1);
  }

  console.log(`Testing batch processing with ${audioFiles.length} files:`);
  audioFiles.forEach((file, idx) => {
    console.log(`  ${idx + 1}. ${file}`);
  });
  console.log();

  // Check Python environment
  console.log('📋 Checking Python Environment');
  console.log('-'.repeat(60));

  const envChecker = PythonEnvChecker.getInstance();
  const envStatus = await envChecker.checkEnvironment();

  if (!envStatus.mlxWhisperAvailable) {
    console.log('❌ mlx-whisper not available. Cannot proceed.');
    process.exit(1);
  }

  console.log(`✅ Python ${envStatus.pythonVersion}, mlx-whisper ${envStatus.mlxWhisperVersion}`);
  console.log();

  // Initialize bridge
  const bridge = new MlxBridge(envStatus.pythonPath || 'python3');

  try {
    console.log('📋 Initializing MLX Bridge');
    console.log('-'.repeat(60));
    await bridge.initialize();
    console.log('✅ Bridge initialized');
    console.log();

    // Load model
    console.log('📋 Loading Model');
    console.log('-'.repeat(60));
    const model = 'mlx-community/whisper-medium-mlx';
    const loadResult = await bridge.loadModel(model);
    console.log(`✅ Model loaded: ${model}`);

    // Show quantization info if available
    if (loadResult.quantized_alternative) {
      console.log(`💡 Quantized alternative available: ${loadResult.quantized_alternative}`);
      console.log(`   Expected speedup: ${loadResult.quantized_speedup}`);
    }
    console.log();

    // Sequential processing (baseline)
    console.log('📋 Sequential Processing (Baseline)');
    console.log('-'.repeat(60));
    const sequentialStart = Date.now();
    const sequentialResults = [];

    for (let i = 0; i < audioFiles.length; i++) {
      console.log(`Processing file ${i + 1}/${audioFiles.length}: ${audioFiles[i]}`);
      const result = await bridge.transcribe({
        audio_path: audioFiles[i],
        language: 'ko',
        model
      });
      sequentialResults.push(result);
      console.log(`  ✅ Completed in ${result.processing_time?.toFixed(2)}s`);
    }

    const sequentialDuration = (Date.now() - sequentialStart) / 1000;
    console.log(`\n✅ Sequential processing completed in ${sequentialDuration.toFixed(2)}s`);
    console.log();

    // Batch processing (Phase 4B)
    console.log('📋 Batch Processing (Phase 4B Feature)');
    console.log('-'.repeat(60));
    console.log(`Processing ${audioFiles.length} files in parallel...`);

    const batchStart = Date.now();
    const batchResult = await bridge.transcribeBatch({
      audio_paths: audioFiles,
      language: 'ko',
      model,
      max_workers: 4
    });
    const batchDuration = (Date.now() - batchStart) / 1000;

    console.log(`\n✅ Batch processing completed in ${batchDuration.toFixed(2)}s`);
    console.log();

    // Performance comparison
    console.log('📊 Performance Comparison');
    console.log('='.repeat(60));
    console.log(`Sequential Time:  ${sequentialDuration.toFixed(2)}s`);
    console.log(`Batch Time:       ${batchDuration.toFixed(2)}s`);
    console.log(`Speedup:          ${(sequentialDuration / batchDuration).toFixed(2)}x`);
    console.log(`Time Saved:       ${(sequentialDuration - batchDuration).toFixed(2)}s`);
    console.log();

    // Results summary
    console.log('📋 Transcription Results');
    console.log('-'.repeat(60));
    batchResult.results.forEach((result: any, idx: number) => {
      if (result.status === 'success') {
        console.log(`\n${idx + 1}. ${result.audio_path}`);
        console.log(`   Language: ${result.language}`);
        console.log(`   Segments: ${result.segments?.length || 0}`);
        console.log(`   Duration: ${result.duration?.toFixed(2)}s`);
        console.log(`   Text preview: ${result.text.substring(0, 100)}...`);
      } else {
        console.log(`\n${idx + 1}. ${result.audio_path}`);
        console.log(`   ❌ Error: ${result.error}`);
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Batch processing test completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await bridge.dispose();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
