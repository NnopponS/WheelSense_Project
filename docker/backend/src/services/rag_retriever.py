"""
RAG Retriever for health knowledge retrieval.
Phase 4D: FAISS-based vector search with SentenceTransformer embeddings.
"""

import json
import logging
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Global retriever instance (lazy loaded)
_rag_retriever_instance = None
_rag_retriever_lock = asyncio.Lock()


def normalize_embedding(embedding: np.ndarray) -> np.ndarray:
    """
    Normalize embedding vector using L2 normalization.
    
    Args:
        embedding: Input embedding vector
        
    Returns:
        Normalized embedding vector (unit vector)
    """
    norm = np.linalg.norm(embedding)
    if norm == 0:
        return embedding
    return embedding / norm


class RAGRetriever:
    """
    Retrieval class for performing similarity search over health knowledge chunks.
    Uses FAISS for vector search and SentenceTransformer for embeddings.
    """
    
    def __init__(self, embeddings_dir: Optional[Path] = None):
        """
        Initialize the RAG Retriever.
        Note: Actual loading happens lazily on first retrieve() call.
        
        Args:
            embeddings_dir: Optional path to embeddings directory. If None, uses default location.
        """
        self.embeddings_dir = embeddings_dir
        self.index = None
        self.id_to_chunk = None
        self.model = None
        self._initialized = False
        self._initialization_error = None
        
        logger.info("RAGRetriever initialized (lazy loading)")
    
    async def _load_retriever(self) -> bool:
        """
        Lazy load FAISS index, ID mapping, and embedding model.
        
        Returns:
            True if loaded successfully, False otherwise
        """
        if self._initialized:
            return True
        
        if self._initialization_error:
            logger.warning(f"RAG retriever previously failed to initialize: {self._initialization_error}")
            return False
        
        try:
            # Determine paths
            if self.embeddings_dir is None:
                # Default: assume rag/embeddings/ is in backend root
                script_dir = Path(__file__).parent
                backend_root = script_dir.parent.parent  # Go up from src/services/ to backend/
                self.embeddings_dir = backend_root / "rag" / "embeddings"
            else:
                self.embeddings_dir = Path(self.embeddings_dir)
            
            index_file = self.embeddings_dir / "faiss_index.bin"
            mapping_file = self.embeddings_dir / "id_to_chunk.json"
            
            # Check if files exist
            if not index_file.exists():
                raise FileNotFoundError(f"FAISS index not found: {index_file}")
            if not mapping_file.exists():
                raise FileNotFoundError(f"ID mapping not found: {mapping_file}")
            
            # Load FAISS index (synchronous operation, but we're in async context)
            # FAISS operations are CPU-bound, so we run in executor
            import faiss
            loop = asyncio.get_event_loop()
            self.index = await loop.run_in_executor(
                None,
                faiss.read_index,
                str(index_file)
            )
            logger.info(f"Loaded FAISS index from: {index_file}")
            
            # Load ID mapping (synchronous file I/O)
            with open(mapping_file, 'r', encoding='utf-8') as f:
                mapping_data = json.load(f)
                id_to_chunk_raw = mapping_data['id_to_chunk']
                
                # Handle both array and dict formats
                # If array, convert to dict with index as key for easier lookup
                if isinstance(id_to_chunk_raw, list):
                    # Convert array to dict: {index: chunk_data}
                    self.id_to_chunk = {str(i): chunk for i, chunk in enumerate(id_to_chunk_raw)}
                elif isinstance(id_to_chunk_raw, dict):
                    # Already a dict, ensure keys are strings
                    self.id_to_chunk = {str(k): v for k, v in id_to_chunk_raw.items()}
                else:
                    raise ValueError(f"Unexpected id_to_chunk format: {type(id_to_chunk_raw)}")
                
                self.mapping_metadata = mapping_data.get('metadata', {})
            logger.info(f"Loaded ID mapping from: {mapping_file}")
            
            # Validate that index and mapping sizes match
            if self.index.ntotal != len(self.id_to_chunk):
                raise ValueError(
                    f"Index size ({self.index.ntotal}) does not match "
                    f"mapping size ({len(self.id_to_chunk)})"
                )
            
            # Load embedding model (synchronous, but model loading is slow)
            # Run in executor to avoid blocking
            from sentence_transformers import SentenceTransformer
            self.model = await loop.run_in_executor(
                None,
                SentenceTransformer,
                'all-MiniLM-L6-v2'
            )
            logger.info("Loaded embedding model: all-MiniLM-L6-v2")
            
            self._initialized = True
            logger.info(f"✓ RAG Retriever initialized with {self.index.ntotal} vectors")
            return True
            
        except FileNotFoundError as e:
            self._initialization_error = str(e)
            logger.warning(f"RAG embeddings not found: {e}. RAG will be unavailable.")
            return False
        except ImportError as e:
            self._initialization_error = str(e)
            logger.error(f"Failed to import RAG dependencies: {e}. Ensure sentence-transformers and faiss-cpu are installed.")
            return False
        except Exception as e:
            self._initialization_error = str(e)
            logger.error(f"Failed to initialize RAG retriever: {e}", exc_info=True)
            return False
    
    def enhance_query(self, query: str, user_condition: str = None) -> str:
        """
        Enhance query with user condition context for better matching.
        
        Args:
            query: Original user query
            user_condition: Optional user condition context (e.g., "diabetes")
            
        Returns:
            Enhanced query string
        """
        if not user_condition or not user_condition.strip():
            return query.strip()
        
        query_lower = query.lower().strip()
        condition_lower = user_condition.lower()
        
        # For exercise/activity queries, add wheelchair-specific terms if condition mentions wheelchair
        is_exercise_query = any(word in query_lower for word in [
            "exercise", "activity", "workout", "physical", "fitness", "movement"
        ])
        has_wheelchair = "wheelchair" in condition_lower or "uses a wheelchair" in condition_lower
        
        if is_exercise_query and has_wheelchair:
            # Prioritize wheelchair exercise knowledge
            enhanced_query = f"{query.strip()} wheelchair exercises wheelchair users seated exercises"
            logger.debug(f"Enhanced exercise query for wheelchair user: {enhanced_query[:100]}...")
            return enhanced_query
        
        # General enhancement with key terms extraction
        key_terms = []
        
        # Extract mobility-related terms
        if "wheelchair" in condition_lower:
            key_terms.append("wheelchair")
        if "mobility" in condition_lower:
            key_terms.append("mobility")
        
        # Extract health condition terms
        health_conditions = [
            "diabetes", "hypertension", "arthritis", "copd", "dementia",
            "depression", "stroke", "parkinson"
        ]
        for condition in health_conditions:
            if condition in condition_lower:
                key_terms.append(condition)
                break  # Usually only one primary condition
        
        # Build enhanced query with key terms prioritized
        if key_terms:
            enhanced_query = f"{query.strip()} {' '.join(key_terms)} {user_condition.strip()}"
        else:
            enhanced_query = f"{query.strip()} {user_condition.strip()}"
        
        logger.debug(f"Enhanced query with key terms: {enhanced_query[:100]}...")
        return enhanced_query
    
    async def retrieve(
        self,
        query: str,
        user_condition: str = None,
        top_k: int = 3,
        threshold: float = 0.5,
        score_gap_threshold: float = 0.20
    ) -> Dict[str, Any]:
        """
        Retrieve relevant chunks for a given query.
        
        Args:
            query: Query string to search for
            user_condition: Optional user condition context for query enhancement
            top_k: Number of top results to retrieve (default: 3)
            threshold: Minimum similarity score threshold (default: 0.5, higher = more precise)
            score_gap_threshold: If gap between top and second result exceeds this,
                               return only the top result (default: 0.20)
            
        Returns:
            Dictionary with either:
            - {"found": True, "chunks": [...]} if results found above threshold
            - {"found": False, "error": str} if no results or error occurred
        """
        # Validate query
        if not query or not query.strip():
            return {"found": False, "error": "Empty query"}
        
        # Load retriever if not already loaded
        if not await self._load_retriever():
            return {
                "found": False,
                "error": f"RAG system not available: {self._initialization_error or 'Initialization failed'}"
            }
        
        try:
            # Enhance query with user condition
            enhanced_query = self.enhance_query(query, user_condition)
            
            # Embed query (synchronous operation, run in executor)
            loop = asyncio.get_event_loop()
            query_embedding = await loop.run_in_executor(
                None,
                self.model.encode,
                enhanced_query,
                {"convert_to_numpy": True}
            )
            
            # Normalize embedding (matches how chunks were embedded)
            query_embedding = normalize_embedding(query_embedding)
            
            # Reshape to (1, dimension) for FAISS search
            query_vector = query_embedding.reshape(1, -1).astype('float32')
            
            # Search FAISS index (synchronous, run in executor)
            import faiss
            scores, indices = await loop.run_in_executor(
                None,
                self.index.search,
                query_vector,
                top_k
            )
            
            # Extract results (FAISS returns shape (1, k))
            scores = scores[0]  # Shape: (k,)
            indices = indices[0]  # Shape: (k,)
            
            # Check threshold: if highest score < threshold, return no results
            if len(scores) == 0 or scores[0] < threshold:
                return {"found": False, "error": "No results above threshold"}
            
            # Build result chunks
            chunks = []
            for i in range(len(scores)):
                # Skip results below threshold
                if scores[i] < threshold:
                    continue
                
                # Get FAISS vector ID
                faiss_id = int(indices[i])
                
                # Lookup chunk from ID mapping
                if faiss_id not in self.id_to_chunk:
                    logger.warning(f"FAISS ID {faiss_id} not found in ID mapping")
                    continue
                
                chunk_data = self.id_to_chunk[str(faiss_id)]
                
                # Format result chunk
                chunk_result = {
                    "text": chunk_data.get('text', ''),
                    "score": float(scores[i]),
                    "metadata": chunk_data.get('metadata', {})
                }
                chunks.append(chunk_result)
            
            # Apply score gap logic: if top result significantly outperforms, return only top
            # This reduces noise when the top result is clearly the best match
            if len(chunks) >= 2:
                score_gap = chunks[0]['score'] - chunks[1]['score']
                if score_gap > score_gap_threshold:
                    chunks = [chunks[0]]  # Return only top result
            
            # Return results
            return {
                "found": True,
                "chunks": chunks
            }
            
        except Exception as e:
            logger.error(f"Error during RAG retrieval: {e}", exc_info=True)
            return {
                "found": False,
                "error": f"Retrieval error: {str(e)}"
            }


async def get_rag_retriever(embeddings_dir: Optional[Path] = None) -> Optional[RAGRetriever]:
    """
    Get or create RAG retriever instance (singleton pattern with async lock).
    
    Args:
        embeddings_dir: Optional path to embeddings directory
        
    Returns:
        RAGRetriever instance or None if initialization fails
    """
    global _rag_retriever_instance
    
    async with _rag_retriever_lock:
        if _rag_retriever_instance is None:
            _rag_retriever_instance = RAGRetriever(embeddings_dir=embeddings_dir)
            # Try to load (non-blocking, will load on first retrieve() call)
            await _rag_retriever_instance._load_retriever()
        
        return _rag_retriever_instance

