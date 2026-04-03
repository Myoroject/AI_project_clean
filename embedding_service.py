import logging
import threading
from typing import List
import numpy as np

logger = logging.getLogger("embedding_service")

# Global singleton for the model footprint
_model = None
_model_lock = threading.Lock()

# BGE small v1.5 is a 384-dimensional retrieval-optimized model
MODEL_NAME = "BAAI/bge-small-en-v1.5"
VECTOR_DIM = 384


def get_model():
    """Lazy load the sentence-transformer model."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                logger.info(f"Loading embedding model: {MODEL_NAME}...")
                try:
                    from sentence_transformers import SentenceTransformer
                    # Load model, defaults to CPU if no GPU available
                    _model = SentenceTransformer(MODEL_NAME)
                    logger.info("Embedding model loaded successfully.")
                except Exception as e:
                    logger.exception(f"Failed to load {MODEL_NAME}: {e}")
                    raise
    return _model


def embed_texts(texts: List[str]) -> np.ndarray:
    """
    Generate embeddings for document blocks.
    BGE does NOT require an instruction prefix for document passages.
    Returns a float32 numpy array of shape (N, 384).
    """
    if not texts:
        return np.array([], dtype=np.float32).reshape(0, VECTOR_DIM)

    model = get_model()
    logger.debug(f"Computing embeddings for {len(texts)} chunks...")
    
    # normalize_embeddings=True is recommended for BGE to output cosine-ready representations
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    
    # Ensure standard numpy float32
    return np.array(embeddings, dtype=np.float32)


def embed_query(query: str) -> np.ndarray:
    """
    Generate embedding for a user query.
    BGE REQUIRES a specific instruction prefix for user queries.
    """
    model = get_model()
    
    # The required BGE prefix for queries
    instruction = "Represent this sentence for searching relevant passages: "
    full_query = instruction + query

    logger.debug(f"Computing query embedding (len={len(query)})...")
    embedding = model.encode([full_query], normalize_embeddings=True, show_progress_bar=False)[0]
    
    return np.array(embedding, dtype=np.float32)
