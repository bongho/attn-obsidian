# Changelog

All notable changes to the ATTN (Audio To Tidied Notes) plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2025-09-07

### 🚀 Major Features

#### Multi-Provider Architecture
- **Complete architectural overhaul** with extensible provider system
- Support for multiple STT providers: OpenAI Whisper, Gemini, Local Whisper
- Support for multiple Summary providers: OpenAI GPT, Gemini, Local LLM
- Provider factory pattern for easy extension and maintenance
- Backward compatibility with existing settings through automatic migration

#### Enhanced Transcription Data
- **Verbose JSON format support** with detailed segment information
- Timestamp data for each transcript segment
- Language detection and duration metadata
- Improved error handling and validation

#### Real-time Path Autocomplete
- **Dynamic autocomplete dropdowns** for Template File Path and Save Folder Path
- Real-time directory and file suggestions as you type
- Seamless integration with existing Browse button functionality
- Custom styling matching Obsidian's design system

### ✨ New Features

#### Model Support Expansion
- **GPT-5 model support** for OpenAI summarization
- Model recommendations with "(Recommended)" labels for optimal choices:
  - OpenAI Whisper (Recommended) for STT
  - OpenAI GPT-4.1 (Recommended) for summarization

#### Localization Improvements
- **Korean language preference** added to default system prompt
- Enhanced multilingual support in transcription processing
- Improved error messages in Korean for better user experience

#### Settings UI Enhancements
- **Organized provider-specific sections** in settings panel
- Dynamic model dropdowns that update based on selected provider
- Clear separation between STT and Summary configurations
- Improved visual hierarchy and user experience

### 🔧 Technical Improvements

#### Test Coverage
- **Comprehensive test suite** with 125+ test cases
- Complete TDD (Test-Driven Development) implementation
- Provider-specific test coverage for all major functionality
- Mock improvements for better test isolation

#### Code Architecture
- **Clean separation of concerns** with interface-based design
- Type safety improvements with comprehensive TypeScript interfaces
- Modular provider implementations for easy maintenance
- Enhanced error handling and logging throughout the codebase

### 🐛 Bug Fixes
- Fixed SuggestModal class extension issues in test environment
- Resolved template processor mock conflicts between tests
- Corrected TypeScript compilation errors with provider types
- Fixed syntax errors in settings autocomplete implementation
- Improved mock state management in test suite

### 📝 API Changes

#### Breaking Changes
- `ApiService` constructor now requires full settings object instead of just API key
- Return format now includes `verboseResult` with detailed transcription data
- Settings structure extended with `stt` and `summary` provider configurations

#### New Types
```typescript
interface VerboseTranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  duration?: number;
}

interface ATTNSettings {
  stt: {
    provider: SttProvider;
    model: string;
    apiKey?: string;
    language: string;
  };
  summary: {
    provider: SummaryProvider;
    model: string;
    apiKey?: string;
  };
  // ... other existing fields
}
```

### 🔄 Migration Notes
- Existing settings are automatically migrated to new provider structure
- Legacy `openaiApiKey` setting is preserved and used as fallback
- No user action required - migration happens seamlessly on plugin update

### 🧪 Development
- Enhanced development workflow with comprehensive testing
- Improved mock system for Obsidian API components
- Better separation between unit and integration tests
- Streamlined provider testing with factory pattern

## [2.0.0] - 2025-09-02

### Added
- 🎨 **Template Engine**: Comprehensive placeholder system for dynamic content generation
  - `{{filename}}` - Original audio file name
  - `{{summary}}` - AI-generated summary
  - `{{date:format}}` - Customizable date formatting using moment.js
  - `{{time:format}}` - Customizable time formatting
- 📁 **Custom Save Folder Path**: Specify where generated notes should be saved
- 📝 **Filename Template**: Dynamic filename generation using placeholders
- 🎯 **Content Template**: Fully customizable note structure and formatting
- 🧪 **Comprehensive Test Coverage**: 80+ tests with 91.25% pass rate using TDD methodology

### Changed
- 🔄 **Refactored NoteCreator**: Simplified responsibility to path + content only
- 🎭 **Enhanced main.ts**: Now acts as orchestrator coordinating all modules
- ⚙️ **Extended Settings Interface**: Added new template configuration fields
- 🏗️ **Modular Architecture**: Improved separation of concerns and extensibility

### Improved
- 🚀 **User Experience**: Complete customization of note generation workflow
- 🔧 **Developer Experience**: Better code organization and maintainability
- 📊 **Type Safety**: Enhanced TypeScript interfaces and type checking
- 🛡️ **Error Handling**: More robust error management across all modules

### Technical
- Added `TemplateProcessor` class with moment.js integration
- Extended `ATTNSettings` interface with template fields
- Refactored file path generation logic
- Enhanced settings UI with new template configuration options

## [1.0.0] - 2024-12-01

### Added
- 🎵 **M4A Audio Processing**: Right-click context menu for M4A files
- 🤖 **OpenAI Integration**: Whisper for transcription, GPT-4 for summarization
- 🔐 **Secure API Key Management**: Local storage of OpenAI API key
- 🇰🇷 **Korean Language Optimization**: Enhanced support for Korean audio content
- 📝 **Automated Note Generation**: One-click conversion to structured meeting notes
- ⚙️ **Settings Management**: Configuration panel for API key setup
- 🧪 **Test-Driven Development**: Initial test suite with Jest framework

### Security
- API key stored locally in Obsidian plugin data
- No external data storage beyond OpenAI processing
- Browser environment safety with `dangerouslyAllowBrowser` flag

### Documentation
- Comprehensive README with setup instructions
- API cost information and usage guidelines
- Development setup and contribution guidelines

## [Unreleased]

### Planned for v2.1
- [ ] Multi-format audio support (MP3, WAV, etc.)
- [ ] Full transcript template support (`{{transcript}}` placeholder)
- [ ] Batch processing capabilities
- [ ] Custom prompt configuration

### Planned for v2.2
- [ ] Local AI model support (Whisper.cpp)
- [ ] Speaker recognition features
- [ ] Real-time audio processing

---

## Release Notes Template

### [Version] - Date

#### Added
- New features and capabilities

#### Changed
- Modifications to existing features

#### Improved
- Performance and usability enhancements

#### Fixed
- Bug fixes and issue resolutions

#### Security
- Security-related changes

#### Technical
- Internal improvements and refactoring