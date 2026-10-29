require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Primary and fallback models for high speed & zero downtime
const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.5-flash';

// Helper to generate system prompt depending on content type & tone
function getSystemPrompt(type = 'text', tone = 'natural') {
  let instructions = `You are an expert AI humanizer engine. Your job is to rewrite AI-generated content so that it reads naturally, authentically, and conversationally, completely avoiding typical robotic AI artifacts.

Key Humanization Principles:
1. Sentence Burstiness: Vary sentence lengths dynamically. Mix short punchy lines with descriptive, flowing sentences.
2. Natural Vocabulary: Eliminate cliché AI buzzwords (e.g., 'furthermore', 'moreover', 'testament to', 'delve into', 'in conclusion', 'tapestry', 'crucial', 'it is imperative that').
3. Organic Cadence: Use natural transitions, active voice, and authentic phrasing.
4. Preserve Meaning: Retain 100% of the core ideas, facts, and intent.
5. STRICT FORMATTING RULE: Return ONLY the final humanized content. DO NOT include introductory notes (like "Here is the rewritten text:"), options, explanations, markdown quotes, or conversational meta-text.`;

  if (type === 'code') {
    instructions = `You are a seasoned senior software engineer. Rewrite this AI-generated code to read as if written by an experienced human developer.
Rules:
- Keep the exact same functional logic and bug-free behavior.
- Use clean, pragmatic variable and function naming conventions.
- Add concise, practical comments where needed, without over-explaining trivial lines.
- Preserve proper indentation and language syntax.
- STRICT FORMATTING RULE: Return ONLY the code (in markdown code fences if appropriate) with NO conversational preamble or sign-offs.`;
  } else if (type === 'email') {
    instructions = `You are an expert communicator. Rewrite this AI-generated email to sound warm, authentic, professional, and written by a real human.
Rules:
- Avoid stuffy corporate cliches or robotic enthusiasm.
- Sound respectful, clear, and direct.
- Keep standard email formatting (Subject line if provided, greeting, body, sign-off).
- STRICT FORMATTING RULE: Return ONLY the final rewritten email text with NO conversational preamble or explanations.`;
  }

  if (tone === 'casual') {
    instructions += `\nTone adjustment: Relaxed, friendly, and conversational (like messaging a trusted colleague).`;
  } else if (tone === 'academic') {
    instructions += `\nTone adjustment: Formal, analytical, and scholarly, yet avoiding repetitive AI filler.`;
  } else if (tone === 'creative') {
    instructions += `\nTone adjustment: Vivid, expressive, and engaging with creative flair.`;
  }

  return instructions;
}

// Helper to get generative model with system instructions
function createModel(modelName, systemInstruction) {
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemInstruction,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
    }
  });
}

// 1. Streaming endpoint for instantaneous response
app.post('/api/humanize-stream', async (req, res) => {
  const { text, type = 'text', tone = 'natural' } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemInstruction = getSystemPrompt(type, tone);
  const prompt = `Rewrite the following ${type} to be completely human:\n\n${text.trim()}`;

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Try primary model first, fallback immediately on error without long sleep
  let activeModel = createModel(PRIMARY_MODEL, systemInstruction);
  let streamResult = null;

  try {
    streamResult = await activeModel.generateContentStream(prompt);
  } catch (err) {
    console.warn(`Primary model (${PRIMARY_MODEL}) failed, trying fallback (${FALLBACK_MODEL}):`, err.message);
    try {
      activeModel = createModel(FALLBACK_MODEL, systemInstruction);
      streamResult = await activeModel.generateContentStream(prompt);
    } catch (fallbackErr) {
      console.error('All models failed:', fallbackErr);
      sendEvent('error', { message: 'Failed to humanize text. Please verify API key or try again.' });
      return res.end();
    }
  }

  try {
    for await (const chunk of streamResult.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        sendEvent('chunk', { text: chunkText });
      }
    }
    sendEvent('done', { complete: true });
    res.end();
  } catch (streamErr) {
    console.error('Error during streaming:', streamErr);
    sendEvent('error', { message: 'Stream interrupted. Please retry.' });
    res.end();
  }
});

// 2. Standard JSON endpoint (for backward compatibility & simple requests)
app.post('/api/humanize', async (req, res) => {
  const { text, type = 'text', tone = 'natural' } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const systemInstruction = getSystemPrompt(type, tone);
  const prompt = `Rewrite the following ${type} to be completely human:\n\n${text.trim()}`;

  // Execute with rapid fallback
  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const model = createModel(modelName, systemInstruction);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const humanizedText = response.text().trim();

      return res.json({ humanizedText, modelUsed: modelName });
    } catch (err) {
      lastError = err;
      console.warn(`Model ${modelName} error:`, err.message);
    }
  }

  console.error('Gemini AI Error:', lastError);
  return res.status(500).json({
    error: 'Failed to humanize text. Please check your Gemini API key or try again in a few moments.'
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
