require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration
const MODEL = process.env.MODEL_NAME || 'google/gemma-4-31b-it:free';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
    console.warn("WARNING: OPENROUTER_API_KEY is not set in environment variables.");
}

async function callModel(prompt, modelOverride) {
    const actualModel = modelOverride || MODEL;
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: actualModel,
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter API Error: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

app.post('/api/step1', async (req, res) => {
    try {
        const { company, what_they_do, financials, deal_type, deal_size, preferred_structure, additional_context, modelSelection } = req.body;
        
        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection === 'openai/gpt-oss-20b:free') stepModel = 'openai/gpt-oss-20b:free';
        // if auto, keep gemma for data extraction (step 1)

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
        const output = await callModel(prompt, stepModel);
        res.json({ output });
    } catch (error) {
        console.error("Error in step 1:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step2', async (req, res) => {
    try {
        const { step1Output, modelSelection } = req.body;
        
        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection === 'openai/gpt-oss-20b:free') stepModel = 'openai/gpt-oss-20b:free';
        // if auto, keep gemma for reasoning & analysis (step 2)

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
        const output = await callModel(prompt, stepModel);
        res.json({ output });
    } catch (error) {
        console.error("Error in step 2:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step3', async (req, res) => {
    try {
        const { step2Output, modelSelection } = req.body;

        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection === 'openai/gpt-oss-20b:free') stepModel = 'openai/gpt-oss-20b:free';
        if (modelSelection === 'auto') stepModel = 'openai/gpt-oss-20b:free'; // if auto, use GPT for prose generation (step 3)

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
- Keep the whole brief tight, aim for around 500-700 words total.`;

        console.log(`Running Step 3 with ${stepModel}...`);
        const output = await callModel(prompt, stepModel);
        res.json({ output });
    } catch (error) {
        console.error("Error in step 3:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step4', async (req, res) => {
    try {
        const { step3Output, modelSelection } = req.body;

        let stepModel = 'google/gemma-4-31b-it:free';
        if (modelSelection === 'openai/gpt-oss-20b:free') stepModel = 'openai/gpt-oss-20b:free';
        if (modelSelection === 'auto') stepModel = 'openai/gpt-oss-20b:free'; // if auto, use GPT for prose polishing (step 4)

        const prompt = `Below is a draft deal brief. Review it critically against this checklist, then produce a revised final version.

${step3Output}

Checklist to apply:
1. Does every number or fact in the brief trace directly back to the original inputs and the analysis? Flag and remove anything that isn't grounded.
2. Is any sentence generic enough that it could apply to almost any company? Rewrite those to be specific.
3. Does the brief read like something a real deal lead would find genuinely useful to start from, or would they end up rewriting most of it? Tighten anything weak.
4. Is the language free of filler phrases, AI-sounding hedges, and inflated words ("robust," "seamless," "leverage," "landscape," "unlock")? Fix any that slipped through.
5. Is the tone honest about risk and open questions, not just confidently positive?

Output the final, revised deal brief only, five sections, same headers as before, ready to hand to a human reviewer.`;

        console.log(`Running Step 4 with ${stepModel}...`);
        const output = await callModel(prompt, stepModel);
        res.json({ output });
    } catch (error) {
        console.error("Error in step 4:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate-pdf', async (req, res) => {
    try {
        const { markdown, companyName } = req.body;

        // Convert markdown to simple LaTeX
        let latex = `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}
\\usepackage{hyperref}
\\usepackage{parskip}

\\title{Deal Brief: ${companyName}}
\\author{Fuse Capital Group}
\\date{\\today}

\\begin{document}

\\maketitle

`;
        
        // Very basic markdown to latex converter for headings, bold, lists
        let body = markdown
            .replace(/^## (.*$)/gim, '\\section*{$1}')
            .replace(/^# (.*$)/gim, '\\section*{$1}')
            .replace(/\*\*(.*?)\*\*/g, '\\textbf{$1}')
            .replace(/\*(.*?)\*/g, '\\textit{$1}')
            .replace(/&/g, '\\&')
            .replace(/%/g, '\\%')
            .replace(/\$/g, '\\$')
            .replace(/#/g, '\\#')
            .replace(/_/g, '\\_')
            .replace(/{/g, '\\{')
            .replace(/}/g, '\\}');

        // Handle simple itemized lists
        const lines = body.split('\\n');
        let inList = false;
        let parsedLines = [];
        
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('- ')) {
                if (!inList) {
                    parsedLines.push('\\begin{itemize}');
                    inList = true;
                }
                parsedLines.push(`  \\item ${line.substring(2)}`);
            } else {
                if (inList) {
                    parsedLines.push('\\end{itemize}');
                    inList = false;
                }
                parsedLines.push(line);
            }
        }
        if (inList) parsedLines.push('\\end{itemize}');

        latex += parsedLines.join('\\n\\n') + '\\n\\end{document}';

        // Fetch PDF from latexonline.cc
        const response = await fetch('https://latexonline.cc/compile?text=' + encodeURIComponent(latex));
        if (!response.ok) {
            throw new Error(`LaTeX compilation failed: ${response.statusText}`);
        }

        const buffer = await response.buffer();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${companyName.replace(/[^a-z0-9]/gi, '_')}_Deal_Brief.pdf"`);
        res.send(buffer);
        
    } catch (error) {
        console.error("PDF generation error:", error);
        res.status(500).json({ error: error.message });
    }
});


app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
