# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People using their own computer who want to find something they previously saw, saved, or created.

## Product Purpose

MindCache is a personal memory layer that helps a user recall material when they need it. The user directs capture, search, and any AI assistance; the product is a tool for recall rather than an autonomous agent.

## Operating Context

A local web dashboard, a browser extension, and a local backend work together. The extension captures browsing activity according to the user's settings; the dashboard provides search, documents, a knowledge graph, privacy settings, model configuration, and setup. The web app can be used while the extension is disconnected.

## Capabilities and Constraints

- Support browser pages, notes, and uploaded files, with search results that explain their matches when evidence is available.
- Users control capture, exclusions, history, and deletion; new installations start with automatic tracking off.
- Users choose models independently for embedding and generation. The existing application supports local Transformers, Ollama, and explicitly configured OpenAI-compatible providers.
- The user's desired privacy boundary is that personal memory remains on their computer. The current implementation also permits explicitly configured remote AI, network model downloads, and page fetching. The exact treatment of those network operations is awaiting clarification; do not claim the current application is fully offline.
- The existing embedding index cannot safely change models without rebuilding; the application currently blocks that change.
- Recall is a source of import and functionality within MindCache, not a separate required product.

## Brand Commitments

The product is called MindCache. Its browser extension is an integral part of the product. The user prefers the earlier MindCache dashboard as the basis of the main web experience and has requested a clean, minimal, welcoming interface.

## Product Principles

- Help people find and understand their own information.
- Make capture and AI choices explicit and user-controlled.
- Keep the experience useful without requiring a model download.
- Describe storage and network behavior accurately.
- Keep the web workspace and browser capture connected to the same memory.
