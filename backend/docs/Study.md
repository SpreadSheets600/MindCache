# MindCache: Search & Retrieval Study Guide

This document is a comprehensive learning resource covering the engineering concepts behind MindCache's search engine. Each topic includes a definition, a simple code/text example, real-world industry usage, and its exact implementation within the MindCache codebase.

---

## 🎓 Beginner

### 1. How Search Engines Work
*   **What it is:** A systematic flow designed to discover, clean, index, rank, and retrieve information. It starts with crawler/ingestion layers collecting data, processing layers structuring it, and a retrieval layer returning the most relevant documents sorted by a ranking algorithm.
*   **Simple Example:** A library catalog system. When a new book arrives, the librarian records its title and topics (ingestion), stores it in a section (indexing), and helps visitors find books by sorting by popularity or match (retrieval/ranking).
*   **Where we use it:** Google Search, Bing, Elasticsearch, and e-commerce websites.
*   **How we use it in MindCache:** Webpages visited in the browser are captured by the Chrome/Firefox extension, sent to the FastAPI backend, cleaned of noise, processed for keywords/entities, indexed locally, and searched through a hybrid ranking algorithm.

### 2. Databases (SQLite Basics)
*   **What it is:** A database is a structured storage system. SQLite is a serverless, self-contained, zero-configuration relational database engine stored in a single local file.
*   **Simple Example:**
    ```sql
    CREATE TABLE search_queries (
        id INTEGER PRIMARY KEY,
        query TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO search_queries (query) VALUES ('rag architecture');
    ```
*   **Where we use it:** Mobile apps (iOS/Android), local desktop software, and caching layers.
*   **How we use it in MindCache:** MindCache stores relational metadata (e.g. documents, visit history, keywords, extracted entities, search queries, and search clicks) in `data/mindcache.db` using SQLAlchemy ORM models defined in [document.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/models/document.py).

### 3. REST APIs
*   **What it is:** Representational State Transfer APIs communicate over standard HTTP protocols. Clients send requests (GET, POST, DELETE) with parameters or JSON body payloads, and servers return structured responses (typically JSON).
*   **Simple Example:**
    ```python
    # POST request payload to record webpage visit
    {
        "url": "https://github.com/karpathy/micrograd",
        "title": "karpathy/micrograd"
    }
    ```
*   **Where we use it:** Web applications, mobile backend services, and microservice architectures.
*   **How we use it in MindCache:** The FastAPI backend exposes REST endpoints (e.g. `/visit` in [visit.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/api/visit.py), `/search` and `/search/click` in [search.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/api/search.py)) which the browser extension calls to transmit data.

### 4. Web Scraping & HTML Extraction
*   **What it is:** Extracting clean, structured text content out of raw, noisy HTML markup by parsing structure and discarding noise like ads, navigations, sidebars, and scripts.
*   **Simple Example:**
    ```python
    from bs4 import BeautifulSoup
    html = "<html><body><nav>Home</nav><main><p>Core text here.</p></main></body></html>"
    soup = BeautifulSoup(html, "html.parser")
    clean_text = soup.find("main").text  # "Core text here."
    ```
*   **Where we use it:** Price trackers, data aggregation feeds, and dataset collection pipelines.
*   **How we use it in MindCache:** MindCache uses `trafilatura` (with a BeautifulSoup fallback) in [document_processor.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/document_processor.py) to extract clean readability text from visited webpages.

### 5. Text Processing
*   **What it is:** Cleaning and tokenizing raw text (lowercasing, punctuation removal, splitting into lists of terms, and filtering out common "stop words" like "the", "is", "a").
*   **Simple Example:**
    ```python
    import re
    raw_text = "Learn RAG in 2026!"
    tokens = re.findall(r"\b\w+\b", raw_text.lower())
    # tokens = ["learn", "rag", "in", "2026"]
    ```
*   **Where we use it:** Spam filtering, sentiment analysis, and compiler lexers.
*   **How we use it in MindCache:** Used in [bm25_service.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/bm25_service.py) to tokenize index contents and search queries, including logic to split hyphens to match compound query terms like `stop-slop`.

### 6. TF-IDF
*   **What it is:** Term Frequency-Inverse Document Frequency. A statistical measure reflecting how important a word is to a document in a collection (corpus). Term Frequency (TF) counts occurrences, while Inverse Document Frequency (IDF) penalizes common words across all documents.
*   **Simple Example:** In a dataset of 100 coding articles, the word "the" appears in all 100 (low IDF). The word "PyTorch" appears in only 2 (high IDF). An article containing "PyTorch" frequently will rank high for "PyTorch".
*   **Where we use it:** Classical search engines, text categorization, and quick search indices.
*   **How we use it in MindCache:** Used in [keyword_extractor.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/keyword_extractor.py) as a highly lightweight fallback keyword extractor using scikit-learn's `TfidfVectorizer` when the local LLM is disabled or unavailable.

### 7. BM25
*   **What it is:** Best Matching 25. A state-of-the-art probabilistic TF-IDF variant. It adjusts term frequency scoring so that term repetition has a saturating effect (preventing keyword stuffing from breaking relevance) and normalizes for document length (penalizing overly wordy documents).
*   **Simple Example:** If a document mentions "python" 5 times, mentioning it a 6th time doesn't increase its score nearly as much as the jump from 0 to 1 mention.
*   **Where we use it:** The core matching algorithm in production platforms like Elasticsearch and Apache Solr.
*   **How we use it in MindCache:** Encapsulated in [bm25_service.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/bm25_service.py) using the `rank-bm25` package to generate lexical candidate matches and scores during hybrid queries.

---

## 🎨 Intermediate

### 1. Embeddings
*   **What it is:** Numerical vector representations of text in a high-dimensional space (e.g. 384 or 768 dimensions), where mathematically close vectors represent semantically similar concepts.
*   **Simple Example:** The vector for "dog" is physically closer to "puppy" than it is to "refrigerator".
*   **Where we use it:** Neural translation, semantic search, text clustering, and LLM text input representations.
*   **How we use it in MindCache:** MindCache calls local Ollama embeddings API (running models like `embeddinggemma:300m`) in [embedding_service.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/embedding_service.py) to generate dense vector representations of text chunks.

### 2. Cosine Similarity
*   **What it is:** A mathematical metric measuring the cosine of the angle between two multi-dimensional vectors. It determines how close two vectors point in a space, independent of their length.
*   **Simple Example:**
    $$\text{similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$
    If vector A and B are identical, similarity is $1.0$. If they are completely unrelated (orthogonal), similarity is $0.0$.
*   **Where we use it:** Recommendation engines, face recognition verification, and semantic retrieval scoring.
*   **How we use it in MindCache:** Used inside the FAISS index search to match the user's search query vector against document chunk vectors.

### 3. Vector Search
*   **What it is:** The process of locating the closest vectors in database space to a given query vector using distance metrics like Cosine Similarity or L2 distance.
*   **Simple Example:** Querying for "car" returns results containing "automobile" or "vehicle" even if the literal word "car" is never present in the text.
*   **Where we use it:** Semantic image retrieval, Q&A systems, and reverse searches.
*   **How we use it in MindCache:** Query vectors are searched against chunk vectors to find the top $K$ semantically matching document chunks in the corpus.

### 4. FAISS
*   **What it is:** Facebook AI Similarity Search. A highly optimized library written in C++ (with Python bindings) designed for fast dense vector clustering and similarity searches in memory or on disk.
*   **Simple Example:** Efficiently searching through millions of 768-dimensional vectors in milliseconds.
*   **Where we use it:** Large-scale commercial vector retrieval databases (e.g. Milvus, Pinecone, or custom indices).
*   **How we use it in MindCache:** MindCache uses FAISS in [vector_service.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/vector_service.py) to manage its vector store locally (`data/faiss_index.bin`) using normalized inner-product L2 distance to perform Cosine Similarity.

### 5. Hybrid Search
*   **What it is:** A search strategy combining lexical search (BM25 for exact terms, names, and codes) with semantic search (FAISS for conceptual meaning) to optimize retrieval performance.
*   **Simple Example:** Lexical search matches specific IDs like `CVE-2026-98` or brand names like `qwen`, while vector search matches the concept of "local lightweight LLM model".
*   **Where we use it:** Advanced search infrastructures like Pinecone, Elasticsearch, and hybrid database extensions.
*   **How we use it in MindCache:** MindCache fetches candidate document IDs from both `bm25_service` and `vector_service`, merges the candidate pool, and ranks them by fusing lexical and semantic scores.

### 6. Metadata Engineering
*   **What it is:** Appending structured contextual metadata (timestamps, domain name, platform statistics, authorship) directly to raw text chunks during processing to guide vectors and keyword indices.
*   **Simple Example:** Pre-pending context: `Title: my repo | Stars: 500 | Topics: [rust, compiler]` to a code chunk.
*   **Where we use it:** E-commerce catalogs, enterprise document filtering, and contextual RAG.
*   **How we use it in MindCache:** MindCache extracts platform metadata (e.g., GitHub stars/topics in [github.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/extractors/github.py), YouTube video channels/transcripts in [youtube.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/extractors/youtube.py)) and embeds this structured text directly into the chunk payload before vector generation in [document_processor.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/document_processor.py).

### 7. Chunking
*   **What it is:** Splitting long texts into smaller, manageable passages (e.g. 3000 characters) with overlapping borders to fit embedding model context limits and prevent semantic loss across splits.
*   **Simple Example:** Splitting a 10,000-character article into 4 chunks of size 3000, with a 500-character overlap at the borders.
*   **Where we use it:** Document pre-processing for LLMs and vector database ingestion.
*   **How we use it in MindCache:** Performed in `document_processor.py` to break cleaned web articles into chunks before saving them to FAISS and SQLite.

---

## 🎓 Advanced

### 1. Information Retrieval (IR)
*   **What it is:** The academic and engineering discipline of organizing, storing, searching, and managing text documents and metadata.
*   **Simple Example:** Designing structures like inverted index lists, dense vector vector-spaces, and boolean filters.
*   **Where we use it:** Library archives, email search engines, and web scrapers.
*   **How we use it in MindCache:** The backend retrieval architecture represents a standalone, single-user local IR engine integrating relational database models and vector/lexical retrieval indexes.

### 2. Search Metrics
*   **What it is:** Quantitative measurements used to evaluate the relevance and quality of search results.
    *   **Precision:** The fraction of retrieved documents that are relevant.
    *   **Recall:** The fraction of all relevant documents that were successfully retrieved.
    *   **Recall@K:** The proportion of relevant documents returned within the top $K$ results.
    *   **MRR (Mean Reciprocal Rank):** Evaluates where the first relevant document is positioned ($1 / \text{rank}$ of the first correct answer).
*   **Simple Example:** If a search returns 5 documents, and the 2nd document is the target, the Reciprocal Rank is $1/2 = 0.5$.
*   **Where we use it:** A/B testing search engines, fine-tuning ranking parameters.
*   **How we use it in MindCache:** A regression search evaluation suite in [test_api.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/tests/test_api.py#L269) reads [search_evaluation.json](https://github.com/SpreadSheets600/MindCache/blob/main/backend/tests/search_evaluation.json) and executes queries to assert that expected documents consistently rank #1 (MRR = 1.0).

### 3. Reranking
*   **What it is:** Re-evaluating and re-sorting a subset of top candidate documents (e.g. top 50) using more comprehensive, slow, or multi-dimensional scoring features than initial retrieval allowed.
*   **Simple Example:** Retrieving 100 candidate documents quickly using BM25, then running them through a heavy cross-encoder neural network to pick the best 10.
*   **Where we use it:** Search portals (Google, Bing), commercial hybrid search engines.
*   **How we use it in MindCache:** The `search_service` merges FAISS and BM25 candidates, then computes a weighted score fusion formula in [search_service.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/search_service.py):
    $$\text{score} = 0.55 \cdot V_{\text{score}} + 0.25 \cdot B_{\text{score}} + 0.10 \cdot T_{\text{score}} + 0.05 \cdot K_{\text{score}} + 0.02 \cdot R_{\text{score}} + 0.03 \cdot S_{\text{score}}$$
    Where components stand for Vector, BM25, Title-overlap, Ingested Keywords, Recency decay, and Source Type boost.

### 4. RAG (Retrieval-Augmented Generation)
*   **What it is:** Supplying documents retrieved from an index as context directly inside an LLM's prompt, allowing the model to generate grounded, factually correct answers without hallucinations.
*   **Simple Example:**
    `"Context: Andrej Karpathy's guidelines include writing clean code. Question: What are Karpathy's coding rules? Answer: ..."`
*   **Where we use it:** Virtual assistants, documentation bots, and enterprise search platforms.
*   **How we use it in MindCache:** MindCache runs local RAG by formatting retrieved document chunks into a synthesis prompt context and calling `qwen3.5:2b` via Ollama to generate collective synthesis summaries.

### 5. Entity Extraction
*   **What it is:** Named Entity Recognition (NER). Identifying and classifying key nouns in unstructured text into predefined categories (e.g. Person, Company, Technology, Project).
*   **Simple Example:** `"I read about PyTorch on Google."` $\to$ `{'PyTorch': 'Technology', 'Google': 'Company'}`
*   **Where we use it:** Automated tagging, text indexing, and building semantic relationship graphs.
*   **How we use it in MindCache:** Managed in [entity_extractor.py](https://github.com/SpreadSheets600/MindCache/blob/main/backend/app/services/entity_extractor.py), which uses Ollama (`qwen3.5:2b`) with a JSON regex extraction fallback to identify entities, store them in SQLite, and prepend them to embeddings.

### 6. Learning to Rank (Click Boosting)
*   **What it is:** Optimizing rank order by leveraging historical user interaction feedback datasets.
*   **Simple Example:** If users consistently click result #3 when searching "slop", the system automatically boosts result #3 to rank #1 for future "slop" queries.
*   **Where we use it:** Google Search ranking, Netflix recommendation lists, and e-commerce sort order.
*   **How we use it in MindCache:** MindCache logs search clicks via `/search/click` to SQLite. During retrieval, the `search_service` applies a click boost (+0.10 per click, capped at +0.30) to previously clicked documents for matching queries.

---

## 🎨 Expert

### 1. Knowledge Graphs
*   **What it is:** Storing information as structured networks of entities (nodes) connected by semantic relationships (edges).
*   **Simple Example:** `(Andrej Karpathy) -> [MEMBER_OF] -> (OpenAI) -> [CREATED] -> (GPT-4)`
*   **Where we use it:** Wikidata, Google Knowledge Panels, and recommendation engines.
*   **How we use it in MindCache:** _Not currently implemented._ Listed as an expert-level extension where extracted entities (Persons, Companies, Technologies) could be linked to visualize a personal local research graph.

### 2. Recommendation Systems
*   **What it is:** Algorithms predicting a user's interest in items based on historical behavior (collaborative filtering or content-based filtering).
*   **Simple Example:** "Since you read 5 articles about RAG, here are related articles from your history you haven't opened in a month."
*   **Where we use it:** YouTube home feed, Amazon shopping recommendation widgets, and Spotify discover weekly.
*   **How we use it in MindCache:** _Not currently implemented._ MindCache could use stored entity and keyword histories to build content recommendations, reminding you of relevant old links while researching.

### 3. Search Personalization
*   **What it is:** Adjusting search ranking criteria to suit a specific user's geographic context, past behavior, and personal preferences.
*   **Simple Example:** A software developer searching "ruby" gets the programming language; a jeweler searching "ruby" gets the gemstone.
*   **Where we use it:** Web search personalization, personalized ad placement.
*   **How we use it in MindCache:** MindCache is inherently personalized because its entire database is private and unique to the user's browsing history. Personalization is reinforced via the recency decay and click boost ranking components.

### 4. Multi-Modal Retrieval
*   **What it is:** Indexing and retrieving information across different media types (text, images, audio, video) in a shared vector space.
*   **Simple Example:** Searching "blue sunset over mountains" retrieves matching photographs directly using joint image-text model embeddings (like CLIP).
*   **Where we use it:** Pinterest search, Google Lens, and video search engines.
*   **How we use it in MindCache:** _Not currently implemented._ MindCache could expand to scrape images from visited pages or save screenshots of visited tabs, vectorizing them to support local visual history searches.

### 5. Distributed Search Systems
*   **What it is:** Distributing a massive search index (sharding) across multiple nodes/machines in a network to scale search storage limits and processing throughput.
*   **Simple Example:** A cluster of 100 servers where each server stores and searches 1% of the total index.
*   **Where we use it:** Web-scale search indexing (Elasticsearch clusters, database replicas).
*   **How we use it in MindCache:** _Intentionally not used._ MindCache is designed to run 100% locally on a single machine to guarantee data privacy, minimize RAM/CPU footprints, and keep operations simple and fast.
