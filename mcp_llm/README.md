# MCP Smart Environment System

A Streamlit-based smart environment assistant for elderly/disabled users. The system uses LLM (via Ollama) to control devices, manage schedules, and provide health-related guidance through RAG (Retrieval-Augmented Generation).

## Features

- **Device Control**: Control lights, AC, TV, Fan, and Alarm across multiple rooms
- **Schedule Management**: Add, modify, and delete daily schedule items
- **Health Knowledge Base**: RAG system provides tailored health recommendations based on user conditions
- **Notification System**: Proactive house checks and activity reminders
- **Natural Language Interface**: Chat-based interaction powered by LLM

## Project Structure

```
mcp_llm/
├── app.py                    # Streamlit UI entry point
├── config.py                 # Configuration constants
├── requirements.txt          # Python dependencies
├── core/                     # Core business logic
│   ├── state.py             # State management
│   └── activity_derivation.py
├── mcp/                      # MCP protocol components
│   ├── server.py            # MCP server implementation
│   └── router.py            # Tool call router
├── llm/                      # LLM interaction
│   ├── client.py            # LLM client
│   └── prompts.py           # System prompts
├── services/                  # Application services
│   └── notification.py      # Notification service
├── utils/                     # Utilities
│   └── safety_logger.py     # Safety logging
└── rag/                      # RAG system
    ├── data/chunks/         # Health knowledge chunks
    ├── embeddings/          # FAISS index and mappings
    └── retrieval/
        └── retriever.py    # RAG retriever
```

## Prerequisites

1. **Python 3.8+**
2. **Ollama** installed and running
   - Download from: https://ollama.ai
   - Install the required model:
     ```bash
     ollama pull qwen2.5:7b
     ```
   - Or use a different model by updating `config.py`

3. **Python Dependencies** (see Installation)

## Installation

1. **Clone or download the project**

2. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
   
   Note: The `requirements.txt` includes basic packages. You may also need:
   ```bash
   pip install sentence-transformers faiss-cpu numpy
   ```
   (These are used by the RAG system but may not be in requirements.txt)

4. **Verify Ollama is running**:
   ```bash
   ollama list
   ```
   Should show `qwen2.5:7b` (or your configured model)

## Configuration

Edit `config.py` to customize:

- **Model**: Change `MODEL_NAME` to use a different LLM model
- **Ollama Host**: Update `OLLAMA_HOST` if Ollama runs on a different host/port
- **Rooms/Devices**: Modify `ROOMS` dictionary to add/remove rooms or devices
- **Default Location**: Change `DEFAULT_USER_LOCATION`

## Running the Application

```bash
streamlit run app.py
```

The application will open in your default web browser at `http://localhost:8501`

## Usage

1. **Start the app** (see Running the Application)

2. **Interact via chat**:
   - Ask questions: "What devices are on?"
   - Control devices: "Turn on the light"
   - Manage schedule: "I have a meeting at 14:00"
   - Get health advice: "What should I eat for breakfast?" (if user has health conditions)

3. **Room Map**: Click on rooms in the left panel to change user location

4. **Schedule**: View and manage daily schedule items

## Key Components

### LLM Client (`llm/client.py`)
- Handles communication with Ollama
- Parses LLM responses into tool calls
- Manages conversation context and summarization

### MCP Server (`mcp/server.py`)
- Implements MCP protocol tools
- Executes device control and schedule modifications
- Integrates with RAG system for health queries

### State Manager (`core/state.py`)
- Manages device states, user location, and schedules
- Handles schedule cloning and one-time events

### RAG System (`rag/`)
- Retrieves relevant health knowledge based on user queries
- Uses FAISS for similarity search
- Provides context-aware health recommendations

## Troubleshooting

**Import Errors**:
- Ensure you're in the project root directory
- Verify virtual environment is activated
- Check that all dependencies are installed

**Ollama Connection Issues**:
- Verify Ollama is running: `ollama list`
- Check `OLLAMA_HOST` in `config.py` matches your Ollama instance
- Ensure the model is installed: `ollama pull qwen2.5:7b`

**RAG System Not Working**:
- Check that `rag/embeddings/faiss_index.bin` exists
- Verify `rag/embeddings/id_to_chunk.json` is present
- Ensure `sentence-transformers` and `faiss-cpu` are installed

## Development Notes

- The project uses a modular architecture with clear separation of concerns
- System prompts are in `llm/prompts.py` for easy modification
- State is in-memory only (no persistence)
- RAG embeddings are pre-computed and stored in `rag/embeddings/`

## License

[Add your license here]

## Contact

[Add contact information]

