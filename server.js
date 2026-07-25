require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const FormData = require('form-data');
const fsNode = require('fs');
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration
const MODEL = process.env.MODEL_NAME || 'google/gemma-4-31b-it:free';
const FALLBACK_MODEL = 'openai/gpt-oss-20b:free';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
    console.warn("WARNING: OPENROUTER_API_KEY is not set in environment variables.");
}

async function callModel(prompt, modelOverride, isFallback = false) {
    const actualModel = modelOverride || MODEL;
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: actualModel,
                max_tokens: 4000,
                messages: [
                    { role: 'user', content: prompt }
                ]
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Status ${response.status}: ${err}`);
        }

        const data = await response.json();
        return { text: data.choices[0].message.content, usedFallback: isFallback, actualModel: isFallback ? FALLBACK_MODEL : actualModel };
        
    } catch (error) {
        if (!isFallback) {
            console.warn(`Model ${actualModel} failed (${error.message}). Auto-switching to fallback model via OpenRouter...`);
            return callModel(prompt, FALLBACK_MODEL, true);
        }
        throw new Error(`OpenRouter API completely failed after fallback: ${error.message}`);
    }
}

// ── Server-side markdown → print HTML ────────────────────────────────────────
function mdToHtml(md) {
    let html = md
        .replace(/^## References$/gim, '<h2 class="refs-header">References</h2>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/^\d+\. (.*$)/gim, '<li class="num">$1</li>')
        .replace(/^[-*] (.*$)/gim, '<li>$1</li>');

    // Wrap consecutive list items
    html = html.replace(/(<li class="num">.*?<\/li>\n?)+/gs, m => `<ol>${m.replace(/ class="num"/g, '')}</ol>`);
    html = html.replace(/(<li>.*?<\/li>\n?)+/gs, m => `<ul>${m}</ul>`);

    // Paragraphs — split on double newlines
    html = html.split(/\n\n+/).map(block => {
        block = block.trim();
        if (!block) return '';
        if (/^<(h[123]|ul|ol|li)/.test(block)) return block;
        return `<p>${block.replace(/\n/g, ' ')}</p>`;
    }).join('\n');

    return html;
}


app.post('/api/parse-document', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) throw new Error("No file uploaded");
        let extractedText = "";
        const filePath = req.file.path;
        
        if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fsNode.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            extractedText = data.text;
        } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value;
        } else if (req.file.mimetype === 'text/plain') {
            extractedText = fsNode.readFileSync(filePath, 'utf8');
        } else {
            throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
        }
        fsNode.unlinkSync(filePath);
        
        const prompt = `You are an AI assistant. Extract the following information from the provided document text and return ONLY a strict JSON object with these keys: "company", "what_they_do", "financials", "deal_type", "deal_size", "preferred_structure", "additional_context". If a field cannot be found, use an empty string "". Do not include markdown formatting.
        
        DOCUMENT TEXT:
        ${extractedText.substring(0, 30000)}
        `;
        
        const { text } = await callModel(prompt, 'google/gemma-4-31b-it:free');
        let jsonRes = {};
        try {
            jsonRes = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        } catch(e) {
            console.error("Failed to parse JSON, returning raw");
            jsonRes = { additional_context: extractedText.substring(0, 5000) };
        }
        res.json({ extracted: jsonRes, rawText: extractedText.substring(0, 10000) });
    } catch (error) {
        console.error("Error parsing document:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/custom-prompt', async (req, res) => {
    try {
        const { promptText, documentText, modelSelection } = req.body;
        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection && modelSelection !== 'auto') stepModel = modelSelection;
        
        const prompt = `You are a professional investment advisory AI. Generate a Deal Brief based on the user instructions and reference document. 
        Format exactly with these headers:
        ## Company Overview
        ## Deal Rationale
        ## Financing Requirement
        ## Suggested Debt Structure
        ## Initial Lender Considerations
        ## References
        
        CRITICAL REQUIREMENT: You MUST include a "## References" section at the end of the brief. Any facts, data, or external knowledge used must be cited using proper APA format with clickable Markdown links. Use in-text APA citations throughout the brief.
        
        USER PROMPT: ${promptText}
        REFERENCE DOCUMENT TEXT: ${documentText ? documentText.substring(0, 15000) : 'None provided.'}`;
        
        console.log(`Running Custom Prompt with ${stepModel}...`);
        const { text, usedFallback, actualModel } = await callModel(prompt, stepModel);
        res.json({ output: text, usedFallback, actualModel });
    } catch (error) {
        console.error("Error in custom prompt:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step1', async (req, res) => {
    try {
        const { company, what_they_do, financials, deal_type, deal_size, preferred_structure, additional_context, modelSelection } = req.body;
        
        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection && modelSelection !== 'auto') stepModel = modelSelection;

        const prompt = `You are a data extraction assistant for an investment advisory firm. Your only job in this step is to take the raw deal inputs below and reorganize them into a clean structured format. Do not analyze, do not infer, do not add anything that isn't explicitly stated. If a detail isn't given, write "Not specified" rather than guessing.

RAW INPUTS:
Company: ${company || 'Not specified'}
What they do: ${what_they_do || 'Not specified'}
Financials: ${financials || 'Not specified'}
Deal Type: ${deal_type || 'Not specified'}
Deal Size: ${deal_size || 'Not specified'}
Preferred Structure: ${preferred_structure || 'Not specified'}
Additional context: ${additional_context || 'Not specified'}

Output as a structured fact sheet with these exact headers:
- Company Identity
- Business Model
- Financial Snapshot
- Deal Purpose
- Deal Parameters
- Ownership & Governance
- Other Notable Context

Keep every line factual and traceable to the input. No commentary.`;
        
        console.log(`Running Step 1 with ${stepModel}...`);
        const { text, usedFallback, actualModel } = await callModel(prompt, stepModel);
        res.json({ output: text, usedFallback, actualModel });
    } catch (error) {
        console.error("Error in step 1:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step2', async (req, res) => {
    try {
        const { step1Output, modelSelection } = req.body;
        
        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection && modelSelection !== 'auto') stepModel = modelSelection;

        const prompt = `You are a credit analyst at an investment advisory firm reviewing a new mandate. Below is a structured fact sheet on a company seeking financing. Your job is to reason through what these facts actually imply, not to write the brief yet, just to think it through clearly.

${step1Output}

Answer these questions directly, in plain analytical language:

1. Why does this company's growth/financial profile point toward needing this financing now? What's the underlying story?

2. Given the deal size against the company's financials, is this a reasonable ask? What would a lender want to know to get comfortable with it?

3. Is the preferred structure sensible for this company's financial profile, or are there tensions worth flagging? What alternative structures or terms might come up in negotiation?

4. What does the ownership and governance structure imply about how this deal gets governed and who needs to sign off?

5. What type of lender would actually suit this deal, and why? Be specific about what this lender needs to be comfortable with.

Do not write brief-style prose yet. Just reason through each point clearly and specifically, referencing the actual facts given.`;
        
        console.log(`Running Step 2 with ${stepModel}...`);
        const { text, usedFallback, actualModel } = await callModel(prompt, stepModel);
        res.json({ output: text, usedFallback, actualModel });
    } catch (error) {
        console.error("Error in step 2:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step3', async (req, res) => {
    try {
        const { step2Output, modelSelection } = req.body;

        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection && modelSelection !== 'auto') stepModel = modelSelection;
        if (modelSelection === 'auto') stepModel = 'openai/gpt-oss-20b:free';

        const prompt = `You are drafting an initial deal brief for the delivery team at an investment advisory firm. This brief will be reviewed and refined by a human analyst before going anywhere near a client or lender, so it needs to be a strong, honest first draft, not a polished final document.

Below is the analysis to work from:

${step2Output}

Write a deal brief with exactly these five sections, using these headers:

## Company Overview
## Deal Rationale
## Financing Requirement
## Suggested Debt Structure
## Initial Lender Considerations

Rules for how you write this:
- Every claim must trace back to the facts and analysis given. Do not invent statistics, comparable deals, or market data that wasn't provided.
- Write like a real analyst, not like marketing copy. Do NOT use words like "leverage," "robust," "seamless," "cutting-edge," "dynamic," "unlock," or "landscape."
- Do NOT structure any list or explanation in exactly three parallel items, vary your structure, some points deserve one sentence, others deserve a full paragraph.
- Do NOT use rhetorical scene-setting or throat-clearing ("In today's fast-evolving market...", "As businesses increasingly look to..."). Start every section directly with substance.
- Where there's a genuine tension or open question, say so plainly rather than glossing over it.
- Keep the whole brief tight, aim for around 500-700 words total.
- If you reference any external concept, industry benchmark, market norm, or general financial knowledge (e.g. "typical senior debt covenants", "SaaS revenue multiples", "UK FCA regulations"), note it inline with a short tag like [Source: industry standard] so the next reviewer knows what to verify.`;

        console.log(`Running Step 3 with ${stepModel}...`);
        const { text, usedFallback, actualModel } = await callModel(prompt, stepModel);
        res.json({ output: text, usedFallback, actualModel });
    } catch (error) {
        console.error("Error in step 3:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step4', async (req, res) => {
    try {
        const { step3Output, modelSelection } = req.body;

        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection && modelSelection !== 'auto') stepModel = modelSelection;
        if (modelSelection === 'auto') stepModel = 'openai/gpt-oss-20b:free';

        const prompt = `Below is a draft deal brief. Review it critically against this checklist, then produce a revised final version.

${step3Output}

Checklist to apply:
1. Does every number or fact in the brief trace directly back to the original inputs and the analysis? Flag and remove anything that isn't grounded.
2. Is any sentence generic enough that it could apply to almost any company? Rewrite those to be specific.
3. Does the brief read like something a real deal lead would find genuinely useful to start from, or would they end up rewriting most of it? Tighten anything weak.
4. Is the language free of filler phrases, AI-sounding hedges, and inflated words ("robust," "seamless," "leverage," "landscape," "unlock")? Fix any that slipped through.
5. Is the tone honest about risk and open questions, not just confidently positive?

OUTPUT STRUCTURE — you MUST follow this exactly, no exceptions:

Output the five polished sections in order:
## Company Overview
## Deal Rationale
## Financing Requirement
## Suggested Debt Structure
## Initial Lender Considerations

Then ALWAYS end with a sixth section:
## References

Under ## References, list every piece of external knowledge, industry norm, benchmark, or general financial concept you used that did NOT come directly from the user's input. Format each reference as a numbered list in APA style with a markdown link where possible. For example:

1. Bain & Company. (2023). *Global Private Credit Outlook*. [https://www.bain.com/insights/private-credit-report-2023](https://www.bain.com/insights/private-credit-report-2023)
2. Bank of England. (2024). *Senior Secured Lending Guidelines*. [https://www.bankofengland.co.uk](https://www.bankofengland.co.uk)

If you used general knowledge with no specific source, still list it as: "Industry standard practice — [brief description]." Do NOT omit the ## References section under any circumstances. Return only the Markdown text.`;

        console.log(`Running Step 4 with ${stepModel}...`);
        const { text, usedFallback, actualModel } = await callModel(prompt, stepModel);
        res.json({ output: text, usedFallback, actualModel });
    } catch (error) {
        console.error("Error in step 4:", error);
        res.status(500).json({ error: error.message });
    }
});

// ── AI-generated LaTeX source (retained for reference) ────────────────────────
app.post('/api/generate-latex-source', async (req, res) => {
    try {
        const { markdown, companyName, modelSelection } = req.body;
        const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

        const prompt = `You are a LaTeX expert. Convert the following deal brief (written in Markdown) into a complete, compilable LaTeX document using the article class.

REQUIREMENTS:
1. Use \\documentclass[11pt,a4paper]{article} with these packages only: inputenc (utf8), fontenc (T1), geometry (margin=1in), xcolor, titlesec, helvet, setspace, hyperref (hidelinks), parskip
2. Define \\definecolor{brandblue}{RGB}{20,40,80} and use it for section headers
3. Format \\section headings with titlesec: uppercase, brandblue, bfseries, with a thin hrule below
4. Use \\renewcommand{\\familydefault}{\\sfdefault} for a clean sans-serif body
5. Title block: \\title{Deal Brief: ${companyName}}, \\author{Fuse Capital Group}, \\date{${today}}
6. CRITICAL — escape ALL special characters properly: % → \\%, & → \\&, $ → \\$, # → \\#, _ → \\_, { → \\{, } → \\}, ~ → \\textasciitilde{}, ^ → \\textasciicircum{}, \\ → \\textbackslash{}
7. Convert ## headers to \\section*{}, ### to \\subsection*{}
8. Convert **bold** to \\textbf{}, *italic* to \\textit{}
9. Convert - bullet lists to \\begin{itemize}...\\end{itemize} with \\item
10. Convert numbered lists to \\begin{enumerate}...\\end{enumerate} with \\item
11. Convert [text](url) links to \\href{url}{text}
12. Keep \\setstretch{1.3} for professional line spacing
13. Output ONLY the raw .tex file content — no markdown code fences, no explanation, no commentary

MARKDOWN CONTENT TO CONVERT:
${markdown}`;

        const defaultModel = 'google/gemini-2.5-flash';
        const modelToUse = modelSelection && modelSelection !== 'auto' ? modelSelection : defaultModel;
        
        const { text, actualModel } = await callModel(prompt, modelToUse);

        const cleaned = text
            .replace(/^```(?:latex|tex)?\s*/i, '')
            .replace(/\s*```\s*$/, '')
            .trim();

        res.json({ latexSource: cleaned, usedModel: actualModel.split('/')[1] || actualModel });
    } catch (error) {
        console.error('LaTeX source generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Puppeteer PDF endpoint (primary PDF engine) ───────────────────────────────
app.post('/api/generate-pdf-puppeteer', async (req, res) => {
    const { markdown, companyName } = req.body;
    if (!markdown) return res.status(400).json({ error: 'No markdown provided' });

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const bodyHtml = mdToHtml(markdown);

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page {
      size: A4;
      margin: 25mm 22mm 25mm 22mm;
  }
  * { box-sizing: border-box; }
  body {
      font-family: 'Georgia', 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.65;
      color: #111;
      background: #fff;
      margin: 0;
      padding: 0;
  }
  .title-block { margin-bottom: 24px; }
  h1.doc-title {
      font-size: 20pt;
      font-weight: bold;
      margin: 0 0 4px 0;
      color: #0a1628;
      letter-spacing: -0.01em;
  }
  .subtitle {
      font-size: 10pt;
      color: #555;
      margin: 2px 0;
      font-style: italic;
  }
  .dateline {
      font-size: 10pt;
      color: #666;
      margin: 2px 0 18px 0;
  }
  hr.divider {
      border: none;
      border-top: 2px solid #1a2a4a;
      margin: 0 0 24px 0;
  }
  h2 {
      font-family: 'Georgia', serif;
      font-size: 11.5pt;
      font-weight: bold;
      color: #1a2a4a;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin: 26px 0 5px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #b0b8cc;
      page-break-after: avoid;
      break-after: avoid;
  }
  h2.refs-header {
      font-family: 'Georgia', serif;
      font-size: 11.5pt;
      font-weight: bold;
      color: #1a2a4a;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin: 26px 0 5px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #b0b8cc;
      page-break-after: avoid;
      break-after: avoid;
  }
  h3 {
      font-size: 11pt;
      font-weight: bold;
      color: #1a2a4a;
      margin: 18px 0 5px 0;
      page-break-after: avoid;
      break-after: avoid;
  }
  p {
      margin: 0 0 9px 0;
      text-align: justify;
      orphans: 3;
      widows: 3;
  }
  ul {
      margin: 5px 0 9px 0;
      padding-left: 20px;
  }
  ol {
      margin: 5px 0 9px 0;
      padding-left: 22px;
  }
  li { margin: 3px 0; }
  a { color: #1a2a4a; text-decoration: underline; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  h2 + p, h3 + p { break-before: avoid; }
</style>
</head>
<body>
  <div class="title-block">
      <h1 class="doc-title">Deal Brief: ${companyName}</h1>
      <p class="subtitle">Prepared by Fuse Capital Group</p>
      <p class="dateline">${today} &nbsp;&bull;&nbsp; Confidential &mdash; For Internal Review Only</p>
      <hr class="divider"/>
  </div>
  ${bodyHtml}
</body>
</html>`;

    let browser;
    try {
        // Lazy-load puppeteer so server starts even if install is incomplete
        const puppeteer = require('puppeteer');

        // On Render and most Linux cloud hosts, --no-sandbox is required
        const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ];

        // Use explicit executablePath so Render always finds the Chrome
        // downloaded by the postinstall hook (avoids "Could not find Chrome" error).
        // PUPPETEER_EXECUTABLE_PATH env var overrides everything (for puppeteer-core setups).
        const launchOpts = { headless: true, args: launchArgs };
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        } else {
            launchOpts.executablePath = puppeteer.executablePath();
        }

        browser = await puppeteer.launch(launchOpts);
        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: false,
            margin: { top: '25mm', right: '22mm', bottom: '25mm', left: '22mm' }
        });

        const safeName = (companyName || 'Company').replace(/[^a-z0-9]/gi, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Deal_Brief.pdf"`);
        res.send(Buffer.from(pdfBuffer));

    } catch (err) {
        console.error('Puppeteer PDF generation error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
