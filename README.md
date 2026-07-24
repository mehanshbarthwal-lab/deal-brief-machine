# Deal Brief Machine

A lightweight web application that demonstrates a 4-step LLM chain for generating a structured financing deal brief. 

This project takes raw company inputs and feeds them through a sequential process:
1. **Extraction & Structuring**: Reorganizes raw inputs into a clean fact sheet.
2. **Analysis Pass**: Reasons through the implications of the facts.
3. **Drafting the Brief**: Generates an initial 5-section deal brief based on the analysis.
4. **Self-Critique & Tighten**: Reviews the draft against a strict set of rules (grounded claims, no filler/marketing words, honest tone) and outputs a final, tightened version.

Built with Node.js and Express. It connects to the OpenRouter API to execute the prompts using a hosted LLM (defaulted to `nvidia/nemotron-3-ultra-550b-a55b:free` due to rate limits on other free tier models).

## Setup & Deployment

1. Clone the repository
2. Run `npm install`
3. Create a `.env` file with your `OPENROUTER_API_KEY`
4. Run `npm start` (or `node server.js`)

Ready for direct deployment to Render as a Web Service.
