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
  if (!text) return '';
  
  // Remove markdown formatting
  text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
  text = text.replace(/\*(.*?)\*/g, '$1'); // Italic
  text = text.replace(/`(.*?)`/g, '$1'); // Code
  text = text.replace(/#{1,6}\s/g, ''); // Headers
  
  // Remove emojis
  text = text.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
  text = text.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols
  text = text.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport
  text = text.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags
  text = text.replace(/[\u{2600}-\u{26FF}]/gu, ''); // Misc symbols
  text = text.replace(/[\u{2700}-\u{27BF}]/gu, ''); // Dingbats
  
  // Remove extra whitespace
  text = text.trim().replace(/\s+/g, ' ');
  
  return text;
}

// Get image URL and description/occupation from Wikipedia
async function getInfoForGuess(name) {
  // Try multiple variations of the name
  const nameVariations = [
    name,
    name + ' (person)',
    name + ' (character)'
  ];
  
  for (const nameVariation of nameVariations) {
    try {
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(nameVariation)}`;
    const response = await fetch(searchUrl);
    if (response.ok) {
      const data = await response.json();
      
      let imageUrl = null;
      if (data.original && data.original.source) {
        imageUrl = data.original.source;
      } else if (data.thumbnail && data.thumbnail.source) {
        imageUrl = data.thumbnail.source.replace('/thumb/', '/').split('/').slice(0, -1).join('/');
      }
      
        // Extract short occupation/description
      let description = '';
      if (data.description && data.description.length <= 100) {
        description = data.description;
      } else {
        const extract = data.extract || '';
        const presidentMatch = extract.match(/(\d+(?:st|nd|rd|th)?(?:\s+and\s+\d+(?:st|nd|rd|th)?)?\s+(?:U\.?S\.?|United States)?\s*President(?:,?\s+[^,\.]+)?)/i);
        if (presidentMatch) {
          description = presidentMatch[1].trim().replace(/\s+/g, ' ');
        } else {
          const occupationPatterns = [
            /(Businessman[^,\.]*)/i,
            /(Actor[^,\.]*)/i,
            /(Singer[^,\.]*)/i,
            /(Politician[^,\.]*)/i,
            /(Writer[^,\.]*)/i,
            /(Athlete[^,\.]*)/i,
            /(Artist[^,\.]*)/i
          ];
          
          const occupations = [];
          for (const pattern of occupationPatterns) {
            const match = extract.match(pattern);
            if (match && occupations.length < 2) {
              occupations.push(match[1].trim());
            }
          }
          
          if (occupations.length > 0) {
            description = occupations.join(', ');
          } else {
            const firstSentence = extract.split('.')[0];
              const namePattern = new RegExp(`^${nameVariation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,\\-–—]?\\s*`, 'i');
            let fallbackDesc = firstSentence.replace(namePattern, '').trim();
            const commaIndex = fallbackDesc.indexOf(',');
            if (commaIndex > 0 && commaIndex < 60) {
              fallbackDesc = fallbackDesc.substring(0, commaIndex);
            } else if (fallbackDesc.length > 60) {
              fallbackDesc = fallbackDesc.substring(0, 57) + '...';
            }
            description = fallbackDesc;
          }
        }
      }
      
        // Return first successful result (with or without image)
      return {
          imageUrl: imageUrl || null,
        description: description || ''
      };
    }
  } catch (error) {
      // Continue to next variation
      continue;
    }
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
    // Always ask about gender first or second - it's crucial for narrowing down
    const firstQuestionVariants = [
      'Ask your first question. CRITICAL: You MUST ask about gender first. Ask "Is your character a female?" or "Is your character a male?" or "Is your character\'s gender female?". Start directly with a short question (3-5 words).',
      'Ask your first question. CRITICAL: You MUST ask about gender first. Ask "Is your character a female?" or "Is your character a male?". Start directly with a short question (3-5 words).',
      'Ask your first question. CRITICAL: You MUST ask about gender first. Ask "Is your character\'s gender female?" or "Is your character\'s gender male?". Start directly with a short question (3-5 words).'
    ];
    
    const randomVariant = firstQuestionVariants[Math.floor(Math.random() * firstQuestionVariants.length)];
    
    const systemPrompt = 'You are playing Akinator. Your response must be ONLY a yes/no question. NO greetings. NO reactions. NO emojis. NO markdown formatting. NO bold text. NO asterisks. NO parenthetical explanations. NO exclamations. BE SPECIFIC - avoid vague terms like "entertainer", "famous person", "celebrity". DO NOT ask about names directly (e.g., "Is your character\'s first name...", "Does your character\'s name start with..."). IMPORTANT: Ask questions that MOST PEOPLE would know the answer to. Avoid overly detailed or obscure questions like specific measurements, exact dates, minor details, or things only experts would know. Ask about well-known characteristics, obvious features, or common knowledge. CRITICAL: You MUST ask about gender in your FIRST question - "Is your character a female?" or "Is your character a male?". This is essential for narrowing down options. CRITICAL: VARY YOUR QUESTIONS COMPLETELY - Never ask about the same topic twice in a row. NEVER ask about occupation (actor, singer, athlete, politician, director, writer, comedian, model, chef, doctor, lawyer, businessman, entrepreneur, or ANY job/profession). Switch between: gender, real/fictional status, relationships, appearance (hair color, eye color, height, distinctive features, bald, beard, glasses), time period, nationality, achievements, hobbies. IMPORTANT: After 5-6 questions, start asking SPECIFIC but COMMONLY KNOWN questions about appearance - "Does your character have blonde hair?", "Is your character bald?", "Does your character have a beard?", "Is your character known for wearing glasses?", "Does your character have tattoos?", "Is your character tall?", "Does your character have blue eyes?". Ask questions that regular people would know, not obscure details. Use ENDLESS VARIETY in appearance questions - never ask similar ones. Ask 15-18 specific questions before guessing to ensure accuracy. Each question should eliminate large groups of possibilities. Ask strategically to narrow down quickly. Questions should be varied and unique. Only if you are really stuck after many questions (15+), you may ask "Does your character\'s name rhyme with [word]?" as a last resort. The person could be ANYONE - real or fictional, famous or obscure, historical or modern, celebrities, characters, adult film actors/actresses, adult content creators, traders, memecoin traders (like Jack Duval), crypto influencers, YouTubers, streamers, social media personalities, or even the player themselves. You can guess the player if clues point to them. After asking enough strategic and specific questions (15-18 questions), make a guess formatted as: "I think you are thinking of: [NAME]". When guessing, be confident with well-known figures - if clues point to someone famous like Donald Trump (president, businessman), Barack Obama (president), Taylor Swift (singer), etc., guess them. CRITICAL: When guessing, ensure the person matches ALL appearance details mentioned in previous answers (e.g., if they said the person is bald, the guess MUST be someone who is bald).';
    
    const conversationHistory = [{
      role: 'user',
      content: randomVariant
    }];

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 50,
      temperature: 0.7,
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
    const { sessionId, answer, conversationHistory: clientHistory, goBack } = req.body;

    if (!gameSessions.has(sessionId)) {
      return res.status(404).json({ error: 'Game session not found' });
    }

    const session = gameSessions.get(sessionId);
    
    // If going back, restore the conversation history
    if (goBack) {
      try {
        if (!clientHistory || !Array.isArray(clientHistory)) {
          return res.status(400).json({ error: 'Invalid conversation history' });
        }
        
        if (clientHistory.length === 0) {
          return res.status(400).json({ error: 'Empty conversation history' });
        }
        
        session.conversationHistory = [...clientHistory];
        // Return the last question from history
        const assistantMessages = session.conversationHistory.filter(m => m && m.role === 'assistant');
        const lastQuestion = assistantMessages[assistantMessages.length - 1];
        
        if (lastQuestion && lastQuestion.content) {
          const questionCount = assistantMessages.length;
          return res.json({
            question: lastQuestion.content,
            isGuess: false,
            questionCount: questionCount
          });
        } else {
          // No question found in history, return error
          return res.status(400).json({ error: 'No previous question found in history' });
        }
      } catch (goBackError) {
        console.error('Error in goBack handler:', goBackError);
        return res.status(500).json({ 
          error: 'Failed to go back',
          details: goBackError.message 
        });
      }
    }
    
    // If client sends conversation history (for syncing), use it
    if (clientHistory && Array.isArray(clientHistory) && !goBack) {
      session.conversationHistory = [...clientHistory];
    }
    
    // Only add answer if not going back
    if (!goBack) {
    session.conversationHistory.push({
      role: 'user',
      content: answer
    });
    }

    // Track answer patterns for confidence calculation
    const recentAnswers = session.conversationHistory
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => m.content.toLowerCase());
    
    const yesCount = recentAnswers.filter(a => a.includes('yes') || a.includes('probably')).length;
    const confidence = yesCount / Math.max(recentAnswers.length, 1);

    // Determine if we should encourage a guess (after 15+ questions for better accuracy)
    const questionCount = session.conversationHistory.filter(m => m.role === 'assistant').length;
    const shouldEncourageGuess = questionCount >= 15 && (confidence > 0.5 || questionCount >= 18);

    // Analyze answers to guide next question - be adaptive
    const allAnswers = session.conversationHistory
      .filter(m => m.role === 'user')
      .map(m => m.content.toLowerCase());
    
    const allQuestions = session.conversationHistory
      .filter(m => m.role === 'assistant' && !m.content.toLowerCase().includes('i think you are thinking of'))
      .map(m => m.content.toLowerCase());
    
    // Track "Don't know" responses and their questions to avoid asking related questions
    const dontKnowPairs = [];
    for (let i = 0; i < session.conversationHistory.length - 1; i++) {
      const msg = session.conversationHistory[i];
      const nextMsg = session.conversationHistory[i + 1];
      if (msg.role === 'assistant' && nextMsg.role === 'user') {
        const answer = nextMsg.content.toLowerCase();
        if (answer.includes("don't know") || answer.includes("dont know") || answer.includes("don't") && answer.includes("know")) {
          dontKnowPairs.push({
            question: msg.content.toLowerCase(),
            answer: answer
          });
        }
      }
    }
    
    // Build instruction to avoid related questions when "Don't know" was answered
    let dontKnowInstruction = '';
    if (dontKnowPairs.length > 0) {
      const relatedTopics = [];
      dontKnowPairs.forEach(pair => {
        const q = pair.question;
        // Detect topic categories from "Don't know" questions
        if (q.includes('age') || q.includes('old') || q.includes('above') || q.includes('below') || q.includes('younger') || q.includes('older') || /\d+/.test(q)) {
          relatedTopics.push('age/numbers');
        }
        if (q.includes('height') || q.includes('tall') || q.includes('short')) {
          relatedTopics.push('height');
        }
        if (q.includes('weight') || q.includes('heavy') || q.includes('light')) {
          relatedTopics.push('weight');
        }
        if (q.includes('nationality') || q.includes('american') || q.includes('british') || q.includes('from')) {
          relatedTopics.push('nationality');
        }
        if (q.includes('century') || q.includes('decade') || q.includes('born') || q.includes('died')) {
          relatedTopics.push('time period');
        }
      });
      
      if (relatedTopics.length > 0) {
        dontKnowInstruction = ` CRITICAL: The user answered "Don't know" to questions about: ${[...new Set(relatedTopics)].join(', ')}. DO NOT ask similar or related questions about these topics. For example, if they said "Don't know" to "Is your character above 40?", DO NOT ask "Is your character above 60?" or any other age-related question. Ask about completely different topics instead.`;
      }
    }
    
    // Ensure gender is asked early (first 1-2 questions)
    const hasAskedGender = allQuestions.some(q => 
      q.includes('gender') || q.includes('female') || q.includes('male') || 
      q.includes('woman') || q.includes('man') || q.includes('girl') || q.includes('boy')
    );
    let genderInstruction = '';
    if (questionCount <= 2 && !hasAskedGender) {
      genderInstruction = ' CRITICAL: You have not asked about gender yet. You MUST ask about gender NOW - "Is your character a female?" or "Is your character a male?". This is essential for narrowing down options.';
    }
    
    // Build comprehensive learning from ALL previous questions and answers
    let learningInstruction = '';
    const qaPairs = [];
    for (let i = 0; i < session.conversationHistory.length - 1; i++) {
      const msg = session.conversationHistory[i];
      const nextMsg = session.conversationHistory[i + 1];
      if (msg.role === 'assistant' && nextMsg.role === 'user' && !msg.content.toLowerCase().includes('i think you are thinking of')) {
        qaPairs.push({
          question: msg.content,
          answer: nextMsg.content.toLowerCase()
        });
      }
    }
    
    // Analyze patterns from all Q&A pairs
    if (qaPairs.length > 0) {
      const yesAnswers = qaPairs.filter(pair => pair.answer.includes('yes') || pair.answer.includes('probably'));
      const noAnswers = qaPairs.filter(pair => pair.answer.includes('no') || pair.answer.includes('probably not'));
      const dontKnowAnswers = qaPairs.filter(pair => pair.answer.includes("don't know") || pair.answer.includes("dont know"));
      
      // Build context from yes answers - especially appearance details
      if (yesAnswers.length > 0) {
        const confirmedTopics = [];
        const appearanceDetails = [];
        yesAnswers.forEach(pair => {
          const q = pair.question.toLowerCase();
          if (q.includes('female') || q.includes('male') || q.includes('gender')) confirmedTopics.push('gender confirmed');
          if (q.includes('real') || q.includes('fictional')) confirmedTopics.push('real/fictional confirmed');
          if (q.includes('actor') || q.includes('singer') || q.includes('musician') || q.includes('athlete') || q.includes('politician')) confirmedTopics.push('occupation confirmed');
          if (q.includes('american') || q.includes('british') || q.includes('nationality')) confirmedTopics.push('nationality confirmed');
          // Track specific appearance details
          if (q.includes('bald') || q.includes('no hair') || q.includes('hairless')) appearanceDetails.push('BALD - has no hair');
          if (q.includes('hair') && !q.includes('bald') && !q.includes('no hair') && !q.includes('hairless')) appearanceDetails.push('HAS HAIR');
          if (q.includes('beard')) appearanceDetails.push('has a beard');
          if (q.includes('glasses')) appearanceDetails.push('wears glasses');
          if (q.includes('tattoo')) appearanceDetails.push('has tattoos');
          if (q.includes('tall')) appearanceDetails.push('is tall');
          if (q.includes('blonde') || q.includes('blond')) appearanceDetails.push('has blonde hair');
          if (q.includes('brown hair') || q.includes('brunette')) appearanceDetails.push('has brown hair');
          if (q.includes('black hair')) appearanceDetails.push('has black hair');
          if (q.includes('red hair')) appearanceDetails.push('has red hair');
        });
        if (confirmedTopics.length > 0) {
          learningInstruction += ` Based on previous YES answers, you know: ${confirmedTopics.join(', ')}. Use this information to narrow down further.`;
        }
        if (appearanceDetails.length > 0) {
          learningInstruction += ` CRITICAL APPEARANCE INFO: ${appearanceDetails.join(', ')}. When guessing, the character MUST match these appearance details. If you said they are BALD, they CANNOT have hair.`;
        }
      }
      
      // Build context from no answers - track specific exclusions
      if (noAnswers.length > 0) {
        const excludedTopics = [];
        const specificExclusions = [];
        noAnswers.forEach(pair => {
          const q = pair.question.toLowerCase();
          // Track general categories
          if (q.includes('actor') || q.includes('singer') || q.includes('musician') || q.includes('athlete') || q.includes('politician')) excludedTopics.push('certain occupations');
          if (q.includes('american') || q.includes('british') || q.includes('nationality')) excludedTopics.push('certain nationalities');
          if (q.includes('real') || q.includes('fictional')) excludedTopics.push('real/fictional status');
          
          // Track specific exclusions (leagues, teams, specific things)
          if (q.includes('league') || q.includes('play in') || q.includes('plays in')) {
            const leagueMatch = q.match(/(?:play|plays|played).*?(?:in|for|with)\s+([^?]+)/i);
            if (leagueMatch) {
              specificExclusions.push(`does NOT play in ${leagueMatch[1].trim()}`);
            } else {
              specificExclusions.push(`does NOT play in the league mentioned`);
            }
          }
          if (q.includes('team') || q.includes('club')) {
            const teamMatch = q.match(/(?:play|plays|played|member).*?(?:for|with|on)\s+([^?]+)/i);
            if (teamMatch) {
              specificExclusions.push(`does NOT play for ${teamMatch[1].trim()}`);
            }
          }
          if (q.includes('country') || q.includes('from')) {
            const countryMatch = q.match(/(?:from|country|nationality).*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
            if (countryMatch) {
              specificExclusions.push(`is NOT from ${countryMatch[1].trim()}`);
            }
          }
        });
        if (excludedTopics.length > 0) {
          learningInstruction += ` Based on previous NO answers, you know these are NOT true: ${excludedTopics.join(', ')}. Ask about different aspects.`;
        }
        if (specificExclusions.length > 0) {
          learningInstruction += ` CRITICAL EXCLUSIONS: ${specificExclusions.join(', ')}. When guessing, the person MUST NOT match these exclusions.`;
        }
      }
      
      // Reference recent answers for context
      if (qaPairs.length >= 2) {
        const lastTwoPairs = qaPairs.slice(-2);
        learningInstruction += ` Recent answers: "${lastTwoPairs[0].answer}" to "${lastTwoPairs[0].question.substring(0, 50)}..." and "${lastTwoPairs[1].answer}" to "${lastTwoPairs[1].question.substring(0, 50)}...". Build on these answers logically.`;
      }
    }
    
    // Build adaptive instruction based on answers
    let adaptiveInstruction = '';
    if (allAnswers.length > 0) {
      const lastAnswer = allAnswers[allAnswers.length - 1];
      const isYes = lastAnswer.includes('yes') || lastAnswer.includes('probably');
      
      // If answered yes to real person, ask about time period or nationality
      if (allQuestions.some(q => q.includes('real') || q.includes('fictional')) && isYes && allQuestions.some(q => q.includes('real'))) {
        adaptiveInstruction = ' Based on the answer, ask about time period, nationality, or specific achievements - NOT occupation yet.';
      }
      // If answered yes to gender, ask about appearance or relationships
      else if (allQuestions.some(q => q.includes('gender') || q.includes('female') || q.includes('male')) && isYes) {
        adaptiveInstruction = ' Based on the answer, ask about appearance, relationships, or distinctive features - NOT occupation yet.';
      }
      // If answered yes to occupation, ask about specific appearance or achievements
      else if (allQuestions.some(q => ['actor', 'singer', 'musician', 'athlete', 'politician', 'occupation', 'job'].some(kw => q.includes(kw))) && isYes) {
        adaptiveInstruction = ' Based on the answer, ask about SPECIFIC appearance details, achievements, or distinctive features - NOT another occupation question.';
      }
      // If answered no, switch to completely different topic
      else if (!isYes && (lastAnswer.includes('no') || lastAnswer.includes('probably not'))) {
        adaptiveInstruction = ' Based on the "no" answer, switch to a COMPLETELY different topic - don\'t ask similar questions.';
      }
    }

    // Check recent questions to encourage variety
    const recentQuestions = session.conversationHistory
      .filter(m => m.role === 'assistant')
      .slice(-3)
      .map(m => m.content.toLowerCase());
    
    // Detect if questions are too similar - track multiple topic categories
    const occupationKeywords = ['actor', 'act', 'movie', 'film', 'role', 'character', 'job', 'occupation', 'profession', 'work', 'career', 'singer', 'musician', 'artist', 'director', 'writer', 'performer', 'entertainer'];
    const genderKeywords = ['male', 'female', 'man', 'woman', 'gender', 'boy', 'girl'];
    const realFictionalKeywords = ['real', 'fictional', 'fictional character', 'real person', 'exists', 'made up'];
    const appearanceKeywords = ['hair', 'eye', 'tall', 'short', 'appearance', 'look', 'wear', 'clothing', 'dress', 'bald', 'beard', 'mustache', 'glasses', 'tattoo', 'piercing', 'skin', 'weight', 'build', 'muscle', 'thin', 'fat', 'slim', 'curly', 'straight', 'blonde', 'brunette', 'red', 'black', 'brown', 'blue', 'green', 'color', 'accent', 'voice', 'catchphrase', 'fashion', 'style'];
    const relationshipKeywords = ['married', 'single', 'relationship', 'spouse', 'partner', 'parent', 'child', 'sibling'];
    const timeKeywords = ['century', 'decade', 'born', 'died', 'alive', 'historical', 'modern', 'ancient', 'year'];
    const nationalityKeywords = ['american', 'british', 'french', 'german', 'japanese', 'chinese', 'nationality', 'country', 'from'];
    
    const recentOccupationCount = recentQuestions.filter(q => 
      occupationKeywords.some(keyword => q.toLowerCase().includes(keyword))
    ).length;
    const recentGenderCount = recentQuestions.filter(q => 
      genderKeywords.some(keyword => q.toLowerCase().includes(keyword))
    ).length;
    const recentRealFictionalCount = recentQuestions.filter(q => 
      realFictionalKeywords.some(keyword => q.toLowerCase().includes(keyword))
    ).length;
    const recentAppearanceCount = recentQuestions.filter(q => 
      appearanceKeywords.some(keyword => q.toLowerCase().includes(keyword))
    ).length;
    const recentRelationshipCount = recentQuestions.filter(q => 
      relationshipKeywords.some(keyword => q.toLowerCase().includes(keyword))
    ).length;
    const recentTimeCount = recentQuestions.filter(q => 
      timeKeywords.some(keyword => q.toLowerCase().includes(keyword))
    ).length;
    const recentNationalityCount = recentQuestions.filter(q => 
      nationalityKeywords.some(keyword => q.toLowerCase().includes(keyword))
    ).length;
    
    let varietyInstruction = '';
    
    // Strong variety enforcement - switch topics after just 1 similar question
    if (recentOccupationCount >= 1) {
      varietyInstruction = 'CRITICAL: You just asked about occupation/work. You are ABSOLUTELY FORBIDDEN from asking about ANY occupation again (actor, singer, musician, athlete, politician, director, writer, comedian, model, chef, doctor, lawyer, businessman, entrepreneur, or ANY job/profession). Switch to a COMPLETELY DIFFERENT topic NOW - ask about appearance (hair color, eye color, height, distinctive features, bald, beard, glasses), relationships, time period, nationality, hobbies, achievements, media presence, or distinctive characteristics. DO NOT ask about occupation AT ALL.';
    } else if (recentGenderCount >= 1) {
      varietyInstruction = 'CRITICAL: You just asked about gender. Switch to a different topic - ask about real/fictional, occupation, relationships, appearance, time period, nationality, or achievements.';
    } else if (recentRealFictionalCount >= 1) {
      varietyInstruction = 'CRITICAL: You just asked about real/fictional. Switch to a different topic - ask about gender, occupation, relationships, appearance, time period, nationality, or achievements.';
    } else if (recentAppearanceCount >= 1) {
      varietyInstruction = 'CRITICAL: You just asked about appearance. Switch to a different topic - ask about gender, real/fictional, occupation, relationships, time period, nationality, or achievements.';
    } else if (recentRelationshipCount >= 1) {
      varietyInstruction = 'CRITICAL: You just asked about relationships. Switch to a different topic - ask about gender, real/fictional, occupation, appearance, time period, nationality, or achievements.';
    } else if (recentTimeCount >= 1) {
      varietyInstruction = 'CRITICAL: You just asked about time period. Switch to a different topic - ask about gender, real/fictional, occupation, relationships, appearance, nationality, or achievements.';
    } else if (recentNationalityCount >= 1) {
      varietyInstruction = 'CRITICAL: You just asked about nationality. Switch to a different topic - ask about gender, real/fictional, occupation, relationships, appearance, time period, or achievements.';
    } else if (recentQuestions.length >= 2 && recentQuestions[recentQuestions.length - 1] === recentQuestions[recentQuestions.length - 2]) {
      varietyInstruction = 'CRITICAL: You just repeated a similar question. Switch to a COMPLETELY different topic immediately.';
    } else {
      // Encourage specific appearance questions after a few questions
      if (questionCount >= 5) {
        varietyInstruction = 'IMPORTANT: Ask VERY SPECIFIC and PERSONAL questions now - "Does your character have blonde hair?", "Is your character known for a specific hairstyle?", "Does your character have a distinctive accent?", "Is your character known for wearing glasses?", "Does your character have tattoos?", "Is your character known for a specific fashion style?", "Does your character have a unique voice?", "Is your character known for a catchphrase?". These specific questions help identify the exact person.';
      } else {
        varietyInstruction = 'IMPORTANT: Vary your questions strategically. Ask about different topics each time - gender, real/fictional, occupation, relationships, appearance (hair, eyes, height, distinctive features), time period, nationality, achievements. Don\'t ask about the same topic twice in a row. Remember to ask about appearance regularly as it helps narrow down options significantly.';
      }
    }
    
    let systemPrompt = 'ONLY a yes/no question. NO greetings, reactions, emojis, markdown, bold, asterisks, explanations. BE SPECIFIC - avoid vague terms like "entertainer", "famous person", "celebrity". DO NOT ask about names directly (e.g., "Is your character\'s first name...", "Does your character\'s name start with..."). IMPORTANT: Ask questions that MOST PEOPLE would know the answer to. Avoid overly detailed or obscure questions like specific measurements, exact dates, minor details, or things only experts would know. Ask about well-known characteristics, obvious features, or common knowledge. ' + genderInstruction + dontKnowInstruction + learningInstruction + varietyInstruction + adaptiveInstruction + ' CRITICAL: VARY YOUR QUESTIONS COMPLETELY - Never ask about the same topic twice in a row. NEVER cycle through occupations (actor, singer, athlete, politician). Switch between: gender, real/fictional status, relationships, appearance (hair color, eye color, height, distinctive features), time period, nationality, achievements, hobbies, media presence, distinctive characteristics. IMPORTANT: After 5-6 questions, start asking SPECIFIC but COMMONLY KNOWN questions about appearance - "Does your character have blonde hair?", "Is your character bald?", "Does your character have a beard?", "Is your character known for wearing glasses?", "Does your character have tattoos?", "Is your character tall?", "Does your character have blue eyes?". Ask questions that regular people would know, not obscure details. Use ENDLESS VARIETY in appearance questions - never ask similar ones. Ask 15-25 specific questions before guessing to ensure accuracy. Each question should eliminate large groups of possibilities. Ask strategically to narrow down quickly. Person could be ANYONE - famous celebrities, traders, memecoin traders (like Jack Duval), crypto influencers, YouTubers, streamers, social media personalities, or even the player themselves. You can guess the player if clues point to them. Only if you are really stuck after many questions (25+), you may ask "Does your character\'s name rhyme with [word]?" as a last resort. After 15-25 questions, guess: "I think you are thinking of: [NAME]"';
    
    if (shouldEncourageGuess) {
      // Include appearance details and exclusions in guess prompt
      const appearanceSummary = learningInstruction.includes('APPEARANCE INFO') ? learningInstruction.split('APPEARANCE INFO:')[1]?.split('.')[0] : '';
      const exclusionSummary = learningInstruction.includes('CRITICAL EXCLUSIONS') ? learningInstruction.split('CRITICAL EXCLUSIONS:')[1]?.split('.')[0] : '';
      let guessInstructions = 'Guess now. Format: "I think you are thinking of: [NAME]".';
      if (appearanceSummary) {
        guessInstructions += ` CRITICAL: The person MUST match these appearance details: ${appearanceSummary}.`;
      }
      if (exclusionSummary) {
        guessInstructions += ` CRITICAL: The person MUST NOT match these exclusions: ${exclusionSummary}. Do NOT guess someone who matches these excluded criteria.`;
      }
      guessInstructions += ' NO emojis, markdown, bold, asterisks, greetings, reactions.';
      systemPrompt = guessInstructions;
    }

    // Get ALL previous questions to prevent repetition - use more aggressive matching
    const allPreviousQuestions = session.conversationHistory
      .filter(m => m.role === 'assistant' && !m.content.toLowerCase().includes('i think you are thinking of'))
      .map(m => m.content.toLowerCase().trim());
    
    // Also extract key words from previous questions for better duplicate detection
    const previousQuestionWords = new Set();
    allPreviousQuestions.forEach(q => {
      // Extract meaningful words (3+ characters, not common words)
      const words = q.split(/\s+/).filter(w => w.length >= 3 && !['the', 'your', 'character', 'is', 'are', 'does', 'have', 'has', 'was', 'were', 'can', 'could', 'would', 'should'].includes(w.toLowerCase()));
      words.forEach(w => previousQuestionWords.add(w.toLowerCase()));
    });
    
    // Add instruction to never repeat questions
    let noRepeatInstruction = '';
    if (allPreviousQuestions.length > 0) {
      noRepeatInstruction = `\n\nCRITICAL: DO NOT REPEAT ANY OF THESE PREVIOUS QUESTIONS: ${allPreviousQuestions.join(' | ')}. You MUST ask a completely NEW question that you have NOT asked before. Do not use the same words or phrases from previous questions.`;
    }
    
    // Use fewer tokens and limit conversation history for faster responses
    const recentHistory = session.conversationHistory.slice(-10); // Only keep last 10 messages
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 40,
      temperature: 0.7,
      system: systemPrompt + noRepeatInstruction,
      messages: recentHistory
    });

    let response = cleanResponse(message.content[0].text);
    
    // Check if the response is a duplicate question (not a guess)
    let isGuess = response.toLowerCase().includes('i think you are thinking of') || 
                   response.toLowerCase().includes('are you thinking of') ||
                   response.toLowerCase().includes('you are thinking of');
    
    if (!isGuess) {
      const responseLower = response.toLowerCase().trim();
      const responseWords = new Set(responseLower.split(/\s+/).filter(w => w.length >= 3));
      
      // Check if this question was asked before (exact match)
      let isDuplicate = allPreviousQuestions.includes(responseLower);
      
      // Also check for similar questions (70% word overlap)
      if (!isDuplicate && previousQuestionWords.size > 0) {
        const matchingWords = Array.from(responseWords).filter(w => previousQuestionWords.has(w));
        const similarity = matchingWords.length / Math.max(responseWords.size, previousQuestionWords.size);
        if (similarity > 0.7) {
          isDuplicate = true;
        }
      }
      
      // Retry up to 3 times if duplicate
      let retryCount = 0;
      while (isDuplicate && retryCount < 3) {
        const retryPrompt = systemPrompt + noRepeatInstruction + `\n\nERROR: You just repeated or asked a very similar question. Ask a COMPLETELY DIFFERENT question with different words. Previous questions: ${allPreviousQuestions.slice(-5).join(' | ')}`;
        const retryMessage = await anthropic.messages.create({
          model: 'claude-opus-4-5-20251101',
          max_tokens: 40,
          temperature: 0.8, // Increase temperature for more variety
          system: retryPrompt,
          messages: recentHistory
        });
        response = cleanResponse(retryMessage.content[0].text);
        const newResponseLower = response.toLowerCase().trim();
        const newResponseWords = new Set(newResponseLower.split(/\s+/).filter(w => w.length >= 3));
        
        // Re-check if duplicate
        isDuplicate = allPreviousQuestions.includes(newResponseLower);
        if (!isDuplicate && previousQuestionWords.size > 0) {
          const matchingWords = Array.from(newResponseWords).filter(w => previousQuestionWords.has(w));
          const similarity = matchingWords.length / Math.max(newResponseWords.size, previousQuestionWords.size);
          if (similarity > 0.7) {
            isDuplicate = true;
          } else {
            isDuplicate = false;
          }
        }
        
        // Re-check if it's a guess after retry
        isGuess = response.toLowerCase().includes('i think you are thinking of') || 
                  response.toLowerCase().includes('are you thinking of') ||
                  response.toLowerCase().includes('you are thinking of');
        if (isGuess) break;
        
        retryCount++;
      }
    }
    
    session.conversationHistory.push({
      role: 'assistant',
      content: response
    });

    // Calculate progress based on questions and confidence
    // Progress increases faster with more "yes" answers
    const baseProgress = Math.min(90, Math.round((questionCount / 20) * 100));
    const confidenceBoost = confidence > 0.6 ? Math.min(15, confidence * 20) : 0;
    const progress = Math.min(95, baseProgress + confidenceBoost); // Cap at 95% until guess

    let guessName = null;
    let guessInfo = null;
    let guessImage = null;
    let guessDescription = null;

    if (isGuess) {
      guessName = extractGuessName(response);
      // ALWAYS fetch image - wait for it before responding
      if (guessName) {
        try {
        guessInfo = await getInfoForGuess(guessName);
          guessImage = guessInfo.imageUrl;
          guessDescription = guessInfo.description;
          
          // If Wikipedia didn't return an image, try alternative methods
          if (!guessImage) {
            // Try with "person" suffix for better Wikipedia matching
            const altGuessInfo = await getInfoForGuess(guessName + ' (person)');
            if (altGuessInfo.imageUrl) {
              guessImage = altGuessInfo.imageUrl;
              guessDescription = altGuessInfo.description || guessDescription;
            }
          }
          
          // Store in session for potential later use
          if (session) {
            session.lastGuessInfo = { imageUrl: guessImage, description: guessDescription };
          }
        } catch (error) {
          console.error('Error fetching guess image:', error);
          // Continue even if image fetch fails - but log it
        }
      }
    }

    // Return with image (or null if not found)
    res.json({
      question: response,
      isGuess,
      questionCount: questionCount + 1,
      progress: isGuess ? 100 : progress,
      guessName: guessName || undefined,
      guessImage: guessImage || undefined,
      guessDescription: guessDescription || undefined
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

      // Continue asking questions - use limited history and fewer tokens
      const recentHistory = session.conversationHistory.slice(-10);
      
      // Track "Don't know" responses and their questions to avoid asking related questions
      const dontKnowPairs = [];
      for (let i = 0; i < session.conversationHistory.length - 1; i++) {
        const msg = session.conversationHistory[i];
        const nextMsg = session.conversationHistory[i + 1];
        if (msg.role === 'assistant' && nextMsg.role === 'user') {
          const answer = nextMsg.content.toLowerCase();
          if (answer.includes("don't know") || answer.includes("dont know") || answer.includes("don't") && answer.includes("know")) {
            dontKnowPairs.push({
              question: msg.content.toLowerCase(),
              answer: answer
            });
          }
        }
      }
      
      // Build instruction to avoid related questions when "Don't know" was answered
      let dontKnowInstruction = '';
      if (dontKnowPairs.length > 0) {
        const relatedTopics = [];
        dontKnowPairs.forEach(pair => {
          const q = pair.question;
          // Detect topic categories from "Don't know" questions
          if (q.includes('age') || q.includes('old') || q.includes('above') || q.includes('below') || q.includes('younger') || q.includes('older') || /\d+/.test(q)) {
            relatedTopics.push('age/numbers');
          }
          if (q.includes('height') || q.includes('tall') || q.includes('short')) {
            relatedTopics.push('height');
          }
          if (q.includes('weight') || q.includes('heavy') || q.includes('light')) {
            relatedTopics.push('weight');
          }
          if (q.includes('nationality') || q.includes('american') || q.includes('british') || q.includes('from')) {
            relatedTopics.push('nationality');
          }
          if (q.includes('century') || q.includes('decade') || q.includes('born') || q.includes('died')) {
            relatedTopics.push('time period');
          }
        });
        
        if (relatedTopics.length > 0) {
          dontKnowInstruction = ` CRITICAL: The user answered "Don't know" to questions about: ${[...new Set(relatedTopics)].join(', ')}. DO NOT ask similar or related questions about these topics. For example, if they said "Don't know" to "Is your character above 40?", DO NOT ask "Is your character above 60?" or any other age-related question. Ask about completely different topics instead.`;
        }
      }
      
      // Get ALL previous questions to prevent repetition - use more aggressive matching
      const allPreviousQuestions = session.conversationHistory
        .filter(m => m.role === 'assistant' && !m.content.toLowerCase().includes('i think you are thinking of'))
        .map(m => m.content.toLowerCase().trim());
      
      // Also extract key words from previous questions for better duplicate detection
      const previousQuestionWords = new Set();
      allPreviousQuestions.forEach(q => {
        // Extract meaningful words (3+ characters, not common words)
        const words = q.split(/\s+/).filter(w => w.length >= 3 && !['the', 'your', 'character', 'is', 'are', 'does', 'have', 'has', 'was', 'were', 'can', 'could', 'would', 'should'].includes(w.toLowerCase()));
        words.forEach(w => previousQuestionWords.add(w.toLowerCase()));
      });
      
      // Add instruction to never repeat questions
      let noRepeatInstruction = '';
      if (allPreviousQuestions.length > 0) {
        noRepeatInstruction = `\n\nCRITICAL: DO NOT REPEAT ANY OF THESE PREVIOUS QUESTIONS: ${allPreviousQuestions.join(' | ')}. You MUST ask a completely NEW question that you have NOT asked before. Do not use the same words or phrases from previous questions.`;
      }
      
      // Build learning instruction for wrong guess handler too
      const qaPairsWrong = [];
      for (let i = 0; i < session.conversationHistory.length - 1; i++) {
        const msg = session.conversationHistory[i];
        const nextMsg = session.conversationHistory[i + 1];
        if (msg.role === 'assistant' && nextMsg.role === 'user' && !msg.content.toLowerCase().includes('i think you are thinking of')) {
          qaPairsWrong.push({
            question: msg.content,
            answer: nextMsg.content.toLowerCase()
          });
        }
      }
      
      let learningInstructionWrong = '';
      if (qaPairsWrong.length > 0) {
        const yesAnswersWrong = qaPairsWrong.filter(pair => pair.answer.includes('yes') || pair.answer.includes('probably'));
        const noAnswersWrong = qaPairsWrong.filter(pair => pair.answer.includes('no') || pair.answer.includes('probably not'));
        
        if (yesAnswersWrong.length > 0) {
          const confirmedTopicsWrong = [];
          yesAnswersWrong.forEach(pair => {
            const q = pair.question.toLowerCase();
            if (q.includes('female') || q.includes('male') || q.includes('gender')) confirmedTopicsWrong.push('gender confirmed');
            if (q.includes('real') || q.includes('fictional')) confirmedTopicsWrong.push('real/fictional confirmed');
            if (q.includes('actor') || q.includes('singer') || q.includes('musician') || q.includes('athlete') || q.includes('politician')) confirmedTopicsWrong.push('occupation confirmed');
          });
          if (confirmedTopicsWrong.length > 0) {
            learningInstructionWrong = ` Based on previous YES answers, you know: ${confirmedTopicsWrong.join(', ')}. Use this information.`;
          }
        }
        
        if (noAnswersWrong.length > 0) {
          const excludedTopicsWrong = [];
          noAnswersWrong.forEach(pair => {
            const q = pair.question.toLowerCase();
            if (q.includes('actor') || q.includes('singer') || q.includes('musician') || q.includes('athlete') || q.includes('politician')) excludedTopicsWrong.push('certain occupations');
          });
          if (excludedTopicsWrong.length > 0) {
            learningInstructionWrong += ` Based on previous NO answers, these are NOT true: ${excludedTopicsWrong.join(', ')}.`;
          }
        }
      }
      
      const baseSystemPrompt = 'ONLY a yes/no question. NO greetings, reactions, emojis, markdown, bold, asterisks. BE SPECIFIC - avoid vague terms like "entertainer", "famous person", "celebrity". DO NOT ask about names directly (e.g., "Is your character\'s first name...", "Does your character\'s name start with..."). IMPORTANT: Ask questions that MOST PEOPLE would know the answer to. Avoid overly detailed or obscure questions like specific measurements, exact dates, minor details, or things only experts would know. Ask about well-known characteristics, obvious features, or common knowledge. CRITICAL: VARY YOUR QUESTIONS COMPLETELY - Never ask about the same topic twice in a row. NEVER cycle through occupations (actor, singer, athlete, politician). Switch between: gender, real/fictional status, relationships, appearance (hair color, eye color, height, distinctive features), time period, nationality, achievements, hobbies, media presence, distinctive characteristics. IMPORTANT: Ask SPECIFIC but COMMONLY KNOWN questions about appearance - "Does your character have blonde hair?", "Is your character bald?", "Does your character have a beard?", "Is your character known for wearing glasses?", "Does your character have tattoos?", "Is your character tall?", "Does your character have blue eyes?". Ask questions that regular people would know, not obscure details. Use ENDLESS VARIETY in appearance questions - never ask similar ones. Ask 15-25 specific questions before guessing to ensure accuracy. Each question should eliminate large groups of possibilities. Ask strategically to narrow down quickly. Person could be ANYONE - famous celebrities, traders, memecoin traders (like Jack Duval), crypto influencers, YouTubers, streamers, social media personalities, or even the player themselves. You can guess the player if clues point to them. Only if you are really stuck after many questions (25+), you may ask "Does your character\'s name rhyme with [word]?" as a last resort. After 15-25 questions, guess: "I think you are thinking of: [NAME]"';
      
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 40,
        temperature: 0.7,
        system: baseSystemPrompt + dontKnowInstruction + learningInstructionWrong + noRepeatInstruction,
        messages: recentHistory
      });

      let nextQuestion = cleanResponse(message.content[0].text);
      
      // Check if the response is a duplicate question (not a guess)
      const isGuessCheck = nextQuestion.toLowerCase().includes('i think you are thinking of') || 
                          nextQuestion.toLowerCase().includes('are you thinking of') ||
                          nextQuestion.toLowerCase().includes('you are thinking of');
      
      if (!isGuessCheck) {
        const questionLower = nextQuestion.toLowerCase().trim();
        const questionWords = new Set(questionLower.split(/\s+/).filter(w => w.length >= 3));
        
        // Check if this question was asked before (exact match)
        let isDuplicate = allPreviousQuestions.includes(questionLower);
        
        // Also check for similar questions (70% word overlap)
        if (!isDuplicate && previousQuestionWords.size > 0) {
          const matchingWords = Array.from(questionWords).filter(w => previousQuestionWords.has(w));
          const similarity = matchingWords.length / Math.max(questionWords.size, previousQuestionWords.size);
          if (similarity > 0.7) {
            isDuplicate = true;
          }
        }
        
        // Retry up to 3 times if duplicate
        let retryCount = 0;
        while (isDuplicate && retryCount < 3) {
          const retryPrompt = baseSystemPrompt + noRepeatInstruction + `\n\nERROR: You just repeated or asked a very similar question. Ask a COMPLETELY DIFFERENT question with different words. Previous questions: ${allPreviousQuestions.slice(-5).join(' | ')}`;
          const retryMessage = await anthropic.messages.create({
            model: 'claude-opus-4-5-20251101',
            max_tokens: 40,
            temperature: 0.8, // Increase temperature for more variety
            system: retryPrompt,
            messages: recentHistory
          });
          nextQuestion = cleanResponse(retryMessage.content[0].text);
          const newQuestionLower = nextQuestion.toLowerCase().trim();
          const newQuestionWords = new Set(newQuestionLower.split(/\s+/).filter(w => w.length >= 3));
          
          // Re-check if duplicate
          isDuplicate = allPreviousQuestions.includes(newQuestionLower);
          if (!isDuplicate && previousQuestionWords.size > 0) {
            const matchingWords = Array.from(newQuestionWords).filter(w => previousQuestionWords.has(w));
            const similarity = matchingWords.length / Math.max(newQuestionWords.size, previousQuestionWords.size);
            if (similarity > 0.7) {
              isDuplicate = true;
            } else {
              isDuplicate = false;
            }
          }
          
          // Re-check if it's a guess after retry
          isGuessCheck = nextQuestion.toLowerCase().includes('i think you are thinking of') || 
                        nextQuestion.toLowerCase().includes('are you thinking of') ||
                        nextQuestion.toLowerCase().includes('you are thinking of');
          if (isGuessCheck) break;
          
          retryCount++;
        }
      }
      
      session.conversationHistory.push({
        role: 'assistant',
        content: nextQuestion
      });

      return res.json({
        question: nextQuestion,
        continue: true
      });
    }
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
