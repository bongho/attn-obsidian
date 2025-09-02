#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_TEMPLATE = {
  openai: {
    apiKey: 'sk-your-openai-api-key-here',
    model: {
      whisper: 'whisper-1',
      chat: 'gpt-4'
    },
    settings: {
      temperature: 0.3,
      language: 'ko'
    }
  },
  plugin: {
    version: '2.0.0',
    debug: false
  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupConfig() {
  console.log('🎵 ATTN Plugin Configuration Setup');
  console.log('=====================================\n');

  const configPath = path.join(process.cwd(), 'config.json');
  
  if (fs.existsSync(configPath)) {
    console.log('⚠️  config.json already exists!');
    const overwrite = await question('Do you want to overwrite it? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('❌ Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('Please provide the following information:\n');

  const apiKey = await question('🔑 OpenAI API Key (sk-...): ');
  if (!apiKey.startsWith('sk-')) {
    console.log('❌ Invalid API key format. Please use a valid OpenAI API key starting with "sk-"');
    rl.close();
    return;
  }

  const model = await question('🤖 Chat Model (default: gpt-4): ') || 'gpt-4';
  const temperature = parseFloat(await question('🌡️  Temperature (default: 0.3): ') || '0.3');
  const language = await question('🌍 Language (default: ko): ') || 'ko';
  const debug = (await question('🔧 Debug mode? (y/N): ')).toLowerCase() === 'y';

  const config = {
    ...CONFIG_TEMPLATE,
    openai: {
      ...CONFIG_TEMPLATE.openai,
      apiKey: apiKey,
      model: {
        ...CONFIG_TEMPLATE.openai.model,
        chat: model
      },
      settings: {
        temperature: temperature,
        language: language
      }
    },
    plugin: {
      ...CONFIG_TEMPLATE.plugin,
      debug: debug
    }
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`\n✅ Configuration saved to ${configPath}`);
    console.log('🎉 ATTN Plugin is ready to use!');
    
    if (debug) {
      console.log('\n🔧 Debug mode is enabled. Check console for detailed logs.');
    }

  } catch (error) {
    console.error('❌ Failed to save configuration:', error.message);
  }

  rl.close();
}

if (require.main === module) {
  setupConfig().catch(console.error);
}

module.exports = { setupConfig };