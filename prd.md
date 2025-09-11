# ATTN (Audio To Tidied Notes) - Product Requirements Document

## 📋 Executive Summary

ATTN is an Obsidian plugin that automatically converts M4A audio files into structured meeting notes using OpenAI Whisper for speech-to-text transcription and GPT for intelligent summarization. The plugin provides seamless integration with Obsidian's workflow, enabling users to transform meeting recordings into organized, searchable notes with minimal effort.

## 🎯 Product Vision

**"Enable effortless transformation of meeting recordings into actionable, well-structured notes within Obsidian."**

## 🚀 Core Value Proposition

- **One-Click Automation**: Right-click M4A files → Select "ATTN: 노트 생성하기" → Get structured meeting notes
- **AI-Powered Intelligence**: Combines OpenAI Whisper (STT) + GPT-4 (Summarization) for high-quality results
- **Seamless Obsidian Integration**: Native plugin experience with customizable templates and folder organization
- **Enterprise-Ready**: Supports large files (up to 48MB+) with intelligent chunking and fallback mechanisms

## 👥 Target Users

### Primary Users
- **Knowledge Workers**: Professionals who conduct regular meetings and need organized documentation
- **Consultants & Freelancers**: Individuals who need to document client meetings efficiently  
- **Students & Researchers**: Academic users recording lectures or interviews
- **Team Leaders**: Managers who want to ensure meeting outcomes are properly documented

### User Personas
1. **"Meeting Manager Mike"**: Team lead who conducts 5-10 meetings weekly and needs consistent documentation
2. **"Consultant Clara"**: Independent consultant who needs to quickly process client meeting recordings
3. **"Student Sam"**: Graduate student recording research interviews and needing structured transcripts

## 🔧 Technical Architecture

### Core Components

#### 1. **Main Plugin Controller** (`main.ts`)
- **Purpose**: Obsidian plugin entry point and orchestration
- **Key Features**: 
  - File explorer context menu integration
  - Settings management
  - Plugin lifecycle management

#### 2. **API Service Layer** (`apiService.ts`)
- **Purpose**: Central orchestration of audio processing workflow
- **Key Capabilities**:
  - Multi-provider support (OpenAI, Gemini, Local)
  - Intelligent chunking for large files (>25MB)
  - Progressive fallback mechanisms
  - Real-time progress tracking with streaming callbacks
  - Performance monitoring and metrics collection

#### 3. **Audio Processing Pipeline**
- **Audio Segmenter** (`audioSegmenter.ts`): Smart file segmentation with FFmpeg integration
- **Audio Processor** (`audioProcessor.ts`): Handles chunking workflow and batch processing
- **Provider System**: Pluggable architecture for STT and summarization services

#### 4. **Provider Architecture**
- **STT Providers**: OpenAI Whisper, Gemini Speech, Local Whisper
- **Summarization Providers**: OpenAI GPT, Gemini Pro, Local LLM
- **Factory Pattern**: Dynamic provider instantiation based on configuration

#### 5. **Template System**
- **Template Processor** (`templateProcessor.ts`): Handlebars-style templating with date/time functions
- **Note Creator** (`noteCreator.ts`): Obsidian-integrated note generation
- **Template Loader** (`templateLoader.ts`): External template file support

## ✨ Feature Specifications

### 🎵 Core Audio Processing

#### Speech-to-Text (STT)
- **Supported Formats**: M4A (primary), MP3, WAV, MP4
- **File Size Limits**: Up to 25MB per chunk (automatically segments larger files)
- **Language Support**: Korean (primary), English, and 50+ languages via Whisper
- **Output Format**: Verbose JSON with timestamps, segments, and speaker information
- **Quality Features**:
  - Automatic language detection
  - Noise reduction and audio normalization
  - Context-aware segmentation

#### Summarization & Analysis
- **AI Models**: GPT-4 (primary), GPT-3.5-turbo, Gemini Pro
- **Summarization Types**:
  - **Standard**: For meetings under 1 hour
  - **Hierarchical**: For ultra-long meetings (1+ hours) with multi-phase processing
- **Output Structure**:
  - Meeting overview with participant analysis
  - Key discussion points and decisions
  - Action items and follow-ups
  - Time-stamped conversation flow

### 🛠️ Advanced Configuration

#### Multi-Provider Support
- **STT Providers**:
  - OpenAI Whisper (Cloud)
  - Gemini Speech API
  - Local Whisper (faster-whisper-cpp, whisper.cpp)
- **Summarization Providers**:
  - OpenAI GPT models
  - Gemini Pro
  - Local LLM via Ollama

#### Processing Settings
- **Chunking Options**: Configurable chunk duration and overlap
- **Audio Preprocessing**: Sample rate conversion, channel mixing
- **Silence Detection**: Intelligent segment splitting
- **Speaker Diarization**: Multi-speaker meeting support (planned)

### 📝 Template System

#### Built-in Placeholders
```
{{filename}}         - Original audio filename
{{summary}}          - AI-generated summary  
{{transcript}}       - Full transcription text
{{speakerTranscript}} - Speaker-separated transcript
{{date:FORMAT}}      - Flexible date formatting
{{time:FORMAT}}      - Time formatting
{{speakers}}         - Detected speakers list
```

#### Template Features
- **External Template Files**: Load templates from `.md` files
- **Conditional Logic**: `{{#if}}` blocks for optional content
- **Date/Time Functions**: Moment.js integration for date formatting
- **Custom Folder Structures**: Dynamic folder creation based on templates

### 🔍 Performance & Reliability

#### Error Handling & Fallbacks
- **Progressive Degradation**: Provide STT results even when summarization fails
- **Token Limit Management**: Ultra-conservative token estimation and truncation
- **Network Resilience**: Automatic retry with exponential backoff
- **Graceful Failures**: User-friendly error messages with actionable guidance

#### Performance Optimization
- **Streaming Processing**: Real-time progress updates during long operations
- **Parallel Processing**: Batch transcription for multiple chunks
- **Caching Strategy**: Intermediate result preservation
- **Memory Management**: Efficient buffer handling for large files

#### Monitoring & Debugging
- **Performance Metrics**: Detailed timing and success rate tracking
- **Debug Logging**: Comprehensive logging system with configurable levels
- **Error Analytics**: Structured error reporting and analysis

### 🎨 User Experience

#### Obsidian Integration
- **Context Menu**: Right-click audio files for instant processing
- **File Explorer**: Native Obsidian file handling
- **Settings Panel**: Comprehensive configuration interface
- **Progress Indicators**: Visual feedback during processing

#### Internationalization
- **Korean**: Primary language with native prompt engineering
- **English**: Full feature support
- **Multi-language**: STT support for 50+ languages

## 📊 Success Metrics

### Primary KPIs
- **Processing Success Rate**: >95% successful transcription completion
- **User Adoption**: Plugin installation and daily active usage
- **Processing Time**: Average time from audio to note completion
- **User Satisfaction**: Feedback scores and feature usage patterns

### Technical Metrics
- **Token Efficiency**: Average tokens used vs. content length
- **Error Rate**: Failed processing attempts by error type
- **Performance**: Processing time per minute of audio
- **Reliability**: Uptime and availability metrics

## 🗓️ Development Roadmap

### Current Status (v1.0.0)
- ✅ Core STT and summarization pipeline
- ✅ OpenAI Whisper + GPT integration
- ✅ Template system with dynamic placeholders
- ✅ Large file chunking and processing
- ✅ Error handling and fallback mechanisms
- ✅ Performance monitoring and metrics
- ✅ Structured transcript formatting

### Near-term Enhancements (v1.1)
- 🔄 Multi-provider support (Gemini, Local LLM)
- 🔄 Speaker diarization for multi-participant meetings
- 🔄 Enhanced template system with more placeholders
- 🔄 Batch processing for multiple files
- 🔄 Export options (PDF, Word, etc.)

### Future Roadmap (v2.0+)
- 🔮 Real-time transcription during meetings
- 🔮 Integration with calendar systems
- 🔮 Advanced analytics and meeting insights
- 🔮 Team collaboration features
- 🔮 Mobile app companion

## 🔒 Security & Privacy

### Data Protection
- **API Key Security**: Secure storage in Obsidian settings
- **No Data Retention**: Audio processed via APIs without permanent storage
- **Local Processing Options**: Support for local Whisper/LLM deployment
- **Privacy First**: No telemetry or usage data collection

### Compliance Considerations
- **GDPR Ready**: No personal data storage or tracking
- **Enterprise Security**: Support for on-premises deployment
- **API Security**: Encrypted communication with service providers

## 🎯 Competitive Analysis

### Advantages
- **Native Obsidian Integration**: Seamless workflow integration
- **AI-Powered Intelligence**: Best-in-class transcription and summarization
- **Customizable Templates**: Flexible note formatting
- **Large File Support**: Handles enterprise-scale audio files
- **Multi-Provider Architecture**: Flexibility and reliability

### Market Position
- **Primary Competition**: Otter.ai, Rev.com, Notion AI
- **Differentiation**: Obsidian-native experience with advanced customization
- **Target Market**: Obsidian power users and knowledge workers

## 🚀 Success Criteria

### Launch Success
- [ ] Plugin published to Obsidian Community Plugin store
- [ ] >1000 downloads in first month
- [ ] <5% error rate in real-world usage
- [ ] Positive community feedback and reviews

### Long-term Success
- [ ] >10,000 active installations
- [ ] Integration with popular Obsidian workflows
- [ ] Community contributions and ecosystem growth
- [ ] Recognition as essential productivity plugin

---

## 📞 Contact & Support

**Developer**: BongHo Lee  
**Repository**: https://github.com/bongho/ATTN  
**License**: MIT  
**Support**: GitHub Issues and Discussions  

---

*This PRD represents the current state and vision for ATTN as of September 2025. Features and specifications may evolve based on user feedback and technical developments.*