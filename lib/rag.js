const STOPWORDS_ID = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'atau', 'pada', 'adalah',
  'ini', 'itu', 'dalam', 'juga', 'karena', 'agar', 'sebagai', 'saat', 'oleh', 'akan',
  'bisa', 'dapat', 'sudah', 'belum', 'kami', 'kamu', 'anda', 'saya', 'aku', 'kita',
  'mereka', 'apa', 'siapa', 'kapan', 'dimana', 'bagaimana', 'kenapa', 'jika', 'kalau',
  'kak', 'min', 'admin', 'ada', 'produk', 'toko'
]);

class RAGEngine {
  tokenize(text) {
    if (!text) return [];
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !STOPWORDS_ID.has(token));
  }

  buildTfMap(tokens) {
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    return tf;
  }

  buildRagIndex(documents) {
    if (!Array.isArray(documents) || documents.length === 0) return { idf: new Map(), vectors: [] };

    const tokenizedDocs = documents.map(doc => this.tokenize(doc.text));
    const docFreq = new Map();

    tokenizedDocs.forEach(tokens => {
      new Set(tokens).forEach(token => docFreq.set(token, (docFreq.get(token) || 0) + 1));
    });

    const totalDocs = Math.max(documents.length, 1);
    const idf = new Map();
    docFreq.forEach((freq, token) => idf.set(token, Math.log((totalDocs + 1) / (freq + 1)) + 1));

    const vectors = tokenizedDocs.map((tokens, index) => {
      const tf = this.buildTfMap(tokens);
      const vector = new Map();
      let normSquared = 0;

      tf.forEach((count, token) => {
        const weight = count * (idf.get(token) || 0);
        vector.set(token, weight);
        normSquared += weight * weight;
      });

      return {
        source: documents[index].source,
        text: documents[index].text,
        vector,
        norm: Math.sqrt(normSquared)
      };
    });

    return { idf, vectors };
  }

  retrieveContext(query, documents, topK = 4) {
    if (!Array.isArray(documents) || documents.length === 0) return [];
    const { idf, vectors } = this.buildRagIndex(documents);
    if (!vectors.length) return [];

    const queryTokens = this.tokenize(query);
    if (!queryTokens.length) return [];

    const queryTf = this.buildTfMap(queryTokens);
    const queryVector = new Map();
    let queryNormSquared = 0;

    queryTf.forEach((count, token) => {
      const weight = count * (idf.get(token) || 0);
      if (weight > 0) {
        queryVector.set(token, weight);
        queryNormSquared += weight * weight;
      }
    });

    const queryNorm = Math.sqrt(queryNormSquared);
    if (!queryNorm) return [];

    return vectors
      .map(item => {
        if (!item.norm) return { ...item, score: 0 };
        let dot = 0;
        queryVector.forEach((qWeight, token) => {
          const dWeight = item.vector.get(token);
          if (dWeight) dot += qWeight * dWeight;
        });
        return { source: item.source, text: item.text, score: dot / (queryNorm * item.norm) };
      })
      .filter(item => item.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  buildContextBlock(contextItems) {
    if (!Array.isArray(contextItems) || contextItems.length === 0) return '';
    return contextItems
      .map((item, index) => {
        const cleanText = String(item.text || '').replace(/\s+/g, ' ').trim();
        return `[Konteks ${index + 1}] Sumber: ${item.source}\n${cleanText}`;
      })
      .join('\n\n');
  }
}

module.exports = RAGEngine;
