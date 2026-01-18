const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
  console.error('Please create a .env file with: ANTHROPIC_API_KEY=your_key_here');
  process.exit(1);
}

// Store game sessions
const gameSessions = new Map();

// Learning data file path
const LEARNING_FILE = path.join(__dirname, 'learning-data.json');

// Load learning data (wrong guesses and correct answers)
async function loadLearningData() {
  try {
    const data = await fs.readFile(LEARNING_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, return empty structure
    return { wrongGuesses: [], correctAnswers: [], questionPatterns: [] };
  }
}

// Save learning data
async function saveLearningData(data) {
  try {
    await fs.writeFile(LEARNING_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving learning data:', error);
  }
}

// Add wrong guess to learning data
async function addWrongGuess(correctAnswer, guess, conversationHistory) {
  const learningData = await loadLearningData();
  learningData.wrongGuesses.push({
    correctAnswer,
    wrongGuess: guess,
    timestamp: new Date().toISOString(),
    conversationLength: conversationHistory.length
  });
  await saveLearningData(learningData);
}

// Add correct guess to learning data
async function addCorrectGuess(answer) {
  const learningData = await loadLearningData();
  learningData.correctAnswers.push({
    answer,
    timestamp: new Date().toISOString()
  });
  await saveLearningData(learningData);
}

// Extract name from guess text
function extractGuessName(text) {
  const patterns = [
    /(?:I think you are thinking of|Are you thinking of|I believe you're thinking of|My guess is)[:\s]+(?:the\s+)?(.*?)(?:[?\.]|$)/i,
    /(?:Thinking of|It is|That would be)[:\s]+(?:the\s+)?(.*?)(?:[?\.]|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/^the\s+/i, '');
    }
  }
  
  // Fallback: try to extract capitalized name
  const words = text.split(/\s+/);
  const nameWords = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[?.,:;!]/g, '');
    if (word[0] && word[0] === word[0].toUpperCase() && word.length > 1) {
      nameWords.push(word);
      if (nameWords.length >= 2) break; // Usually names are 2+ words
    }
  }
  return nameWords.join(' ') || null;
}

// Clean AI response - remove markdown, emojis, extra text
function cleanResponse(text) {
  if (!text) return text;
  
  // Check if it's a guess first - preserve guess format
  const isGuess = text.toLowerCase().includes('i think you are thinking of') || 
                  text.toLowerCase().includes('are you thinking of') ||
                  text.toLowerCase().includes('you are thinking of');
  
  // Remove markdown bold/italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold** -> bold
  text = text.replace(/\*([^*]+)\*/g, '$1'); // *italic* -> italic
  text = text.replace(/__([^_]+)__/g, '$1'); // __bold__ -> bold
  text = text.replace(/_([^_]+)_/g, '$1'); // _italic_ -> italic
  
  // Remove emojis (basic pattern)
  text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, ''); // Emoji ranges
  text = text.replace(/[\u{2600}-\u{26FF}]/gu, ''); // Miscellaneous symbols
  text = text.replace(/[\u{2700}-\u{27BF}]/gu, ''); // Dingbats
  
  // Remove common greeting/exclamation patterns at start (only for questions)
  if (!isGuess) {
    text = text.replace(/^(Great!|Awesome!|Perfect!|Okay!|Let's play!|Alright!|Great|Awesome|Perfect|Okay|Alright)[\s!:\s]*/i, '');
    // Remove parenthetical explanations at end (e.g., "(as opposed to...)")
    text = text.replace(/\s*\([^)]*\)\s*$/g, '');
  }
  
  // Trim and ensure single spaces
  text = text.trim().replace(/\s+/g, ' ');
  
  // If it's a guess, return as-is
  if (isGuess) {
    return text;
  }
  
  // For questions, ensure they end with a question mark
  if (text && !text.endsWith('?') && !text.includes(':')) {
    text = text + '?';
  }
  
  return text;
}

// Get image URL and description/occupation from Wikipedia
async function getInfoForGuess(name) {
  try {
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    const response = await fetch(searchUrl);
    if (response.ok) {
      const data = await response.json();
      
      let imageUrl = null;
      if (data.original && data.original.source) {
        imageUrl = data.original.source;
      } else if (data.thumbnail && data.thumbnail.source) {
        imageUrl = data.thumbnail.source.replace('/thumb/', '/').split('/').slice(0, -1).join('/');
      }
      
      // Extract description/occupation from extract (first sentence usually has this)
      let description = data.extract || data.description || '';
      // Get first sentence which typically contains occupation/role
      const firstSentence = description.split('.')[0];
      // If extract starts with the name, get the part after it
      const namePattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,\\-–—]?\\s*`, 'i');
      const cleanDescription = firstSentence.replace(namePattern, '').trim();
      
      return {
        imageUrl,
        description: cleanDescription || data.description || ''
      };
    }
  } catch (error) {
    console.error('Error fetching info from Wikipedia:', error);
  }
  return { imageUrl: null, description: null };
}

// API endpoint to get image and info for a guess
app.get('/api/game/info/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const info = await getInfoForGuess(name);
    res.json(info);
  } catch (error) {
    console.error('Error getting info:', error);
    res.json({ imageUrl: null, description: null });
  }
});

// Initialize a new game session
app.post('/api/game/start', async (req, res) => {
  try {
    const sessionId = Date.now().toString();
    // Vary first question - sometimes gender, sometimes real/fictional
    const firstQuestionVariants = [
      'Ask your first question. Vary it - sometimes start with gender like "Is your character a female?" or "Is your character\'s gender female?", sometimes with "Is your character real?" Start directly with a short question (3-5 words) to eliminate as many people as possible.',
      'Ask your first question. Choose strategically - either gender (like "Is your character a female?" or "Is your character a male?") or real/fictional ("Is your character real?"). Start directly with a short question (3-5 words).',
      'Ask your first question. Start with either gender or real/fictional status. Keep it short (3-5 words). Examples: "Is your character a female?" or "Is your character real?" or "Is your character\'s gender female?"'
    ];
    const randomVariant = firstQuestionVariants[Math.floor(Math.random() * firstQuestionVariants.length)];
    
    const systemPrompt = 'You are playing Akinator. Your response must be ONLY a yes/no question. NO greetings. NO reactions. NO emojis. NO markdown formatting. NO bold text. NO asterisks. NO parenthetical explanations. NO exclamations. Ask diverse strategic questions - mix gender, real/fictional, occupation, hobbies, relationships, appearance, time period, nationality, etc. Don\'t focus only on occupation. Questions should be varied and unique. The person could be ANYONE - real or fictional, famous or obscure, historical or modern, celebrities, characters, adult film actors/actresses, adult content creators, or even the player themselves. After asking enough strategic questions (8-15 questions), make a guess formatted as: "I think you are thinking of: [NAME]". When guessing, be confident with well-known figures - if clues point to someone famous like Donald Trump (president, businessman), Barack Obama (president), Taylor Swift (singer), etc., guess them.';
    
    const conversationHistory = [{
      role: 'user',
      content: randomVariant
    }];

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 100,
      system: systemPrompt,
      messages: conversationHistory
    });

    const firstQuestion = cleanResponse(message.content[0].text);
    conversationHistory.push({
      role: 'assistant',
      content: firstQuestion
    });

    gameSessions.set(sessionId, {
      conversationHistory,
      guessCount: 0
    });

    res.json({
      sessionId,
      question: firstQuestion
    });
  } catch (error) {
    console.error('Error starting game:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to start game',
      details: error.message 
    });
  }
});

// Submit an answer and get next question
app.post('/api/game/answer', async (req, res) => {
  try {
    const { sessionId, answer } = req.body;

    if (!gameSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Game session not found' });
    }

    const session = gameSessions.get(sessionId);
    session.conversationHistory.push({
      role: 'user',
      content: answer
    });

    // Track answer patterns for confidence calculation
    const recentAnswers = session.conversationHistory
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => m.content.toLowerCase());
    
    const yesCount = recentAnswers.filter(a => a.includes('yes') || a.includes('probably')).length;
    const confidence = yesCount / Math.max(recentAnswers.length, 1);

    // Determine if we should encourage a guess (after 6+ questions for faster guessing)
    const questionCount = session.conversationHistory.filter(m => m.role === 'assistant').length;
    const shouldEncourageGuess = questionCount >= 6 && (confidence > 0.4 || questionCount >= 10);

    let systemPrompt = 'Your response must be ONLY a yes/no question. NO greetings. NO reactions. NO emojis. NO markdown formatting. NO bold text. NO asterisks. NO parenthetical explanations. NO exclamations. Ask diverse strategic questions - mix gender, real/fictional, occupation, hobbies, relationships, appearance, time period, nationality, media presence, etc. Don\'t focus only on occupation. Questions should be varied and unique. Questions can vary in length naturally (like "Is your character a female?" or "Does your character personally know you?" or "Is your character linked with sports?"). The person could be ANYONE - real or fictional, famous or obscure, historical or modern, celebrities, characters, adult film actors/actresses, adult content creators, or even the player themselves. When you have enough information (typically after 8-15 strategic questions), make a guess formatted as: "I think you are thinking of: [NAME]"';
    
    if (shouldEncourageGuess) {
      systemPrompt = 'You have asked enough questions. Make your guess now based on the information gathered. Be confident - if clues match a well-known person (like Donald Trump, Barack Obama, Albert Einstein, Taylor Swift, etc.), guess them. Format as: "I think you are thinking of: [NAME]". If you are truly unsure, ask ONE more strategic question. NO emojis. NO markdown formatting. NO bold text. NO asterisks. NO greetings. NO reactions. The person could be ANYONE - real or fictional, famous or obscure, historical or modern, celebrities, characters, adult film actors/actresses, adult content creators, or even the player themselves.';
    }

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 100,
      system: systemPrompt,
      messages: session.conversationHistory
    });

    const response = cleanResponse(message.content[0].text);
    session.conversationHistory.push({
      role: 'assistant',
      content: response
    });

    // Check if this is a guess
    const isGuess = response.toLowerCase().includes('i think you are thinking of') || 
                   response.toLowerCase().includes('are you thinking of') ||
                   response.toLowerCase().includes('you are thinking of');

    // Calculate progress based on questions and confidence
    // Progress increases faster with more "yes" answers
    const baseProgress = Math.min(90, Math.round((questionCount / 20) * 100));
    const confidenceBoost = confidence > 0.6 ? Math.min(15, confidence * 20) : 0;
    const progress = Math.min(95, baseProgress + confidenceBoost); // Cap at 95% until guess

    let guessName = null;
    let guessInfo = null;

    if (isGuess) {
      guessName = extractGuessName(response);
      // Fetch info (image and description) for the guess
      if (guessName) {
        guessInfo = await getInfoForGuess(guessName);
      }
    }

    res.json({
      question: response,
      isGuess,
      questionCount: questionCount + 1,
      progress: isGuess ? 100 : progress,
      guessName: guessName || undefined,
      guessImage: guessInfo?.imageUrl || undefined,
      guessDescription: guessInfo?.description || undefined
    });
  } catch (error) {
    console.error('Error processing answer:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to process answer',
      details: error.message 
    });
  }
});

// Handle guess result
app.post('/api/game/guess-result', async (req, res) => {
  try {
    const { sessionId, correct, actualAnswer } = req.body;

    if (!gameSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Game session not found' });
    }

    const session = gameSessions.get(sessionId);
    
    if (correct) {
      // Save correct guess to learning data
      const lastGuess = session.conversationHistory
        .filter(m => m.role === 'assistant')
        .slice(-1)[0]?.content;
      if (lastGuess) {
        const guessedName = extractGuessName(lastGuess);
        if (guessedName) {
          await addCorrectGuess(guessedName);
        }
      }
      
      session.conversationHistory.push({
        role: 'user',
        content: 'Yes, that\'s correct!'
      });
    } else {
      // Save wrong guess to learning data
      const lastGuess = session.conversationHistory
        .filter(m => m.role === 'assistant')
        .slice(-1)[0]?.content;
      if (lastGuess && actualAnswer) {
        const guessedName = extractGuessName(lastGuess);
        if (guessedName) {
          await addWrongGuess(actualAnswer, guessedName, session.conversationHistory);
        }
      }
      
      session.conversationHistory.push({
        role: 'user',
        content: `No, that's not correct. ${actualAnswer ? `The correct answer is: ${actualAnswer}` : 'Please ask more questions.'}`
      });

      // Continue asking questions
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 100,
        system: 'Your guess was wrong. Your response must be ONLY a yes/no question. NO greetings. NO reactions. NO emojis. NO markdown formatting. NO bold text. NO asterisks. NO parenthetical explanations. Ask diverse strategic questions - mix gender, real/fictional, occupation, hobbies, relationships, appearance, time period, nationality, media presence, etc. Don\'t focus only on occupation. Questions should be varied and unique. The person could be ANYONE - real or fictional, famous or obscure, historical or modern, celebrities, characters, adult film actors/actresses, adult content creators, or even the player themselves. Ask 3-5 more strategic questions then guess again. Format guess as: "I think you are thinking of: [NAME]"',
        messages: session.conversationHistory
      });

      const nextQuestion = cleanResponse(message.content[0].text);
      session.conversationHistory.push({
        role: 'assistant',
        content: nextQuestion
      });

      return res.json({
        question: nextQuestion,
        continue: true
      });
    }

    // Clean up session
    gameSessions.delete(sessionId);

    res.json({
      success: true,
      message: correct ? 'Great! I guessed correctly!' : 'Thanks for playing!'
    });
  } catch (error) {
    console.error('Error processing guess result:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to process guess result',
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
