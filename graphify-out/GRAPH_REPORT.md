# Deal Brief Machine (AI Workflow) - Knowledge Graph Report

## Project State
The project is a web application that extracts information from documents (via file upload and AI parsing), populates a deal form, and generates a structured Deal Brief using a multi-agent AI pipeline.
The UI uses TailwindCSS and features a left-side input form and a right-side preview/status panel.

## Key Architectures & Components

### 1. Frontend (`public/index.html`)
- **Mode Toggles:** Switches between "Structured" (form-based) and "Custom" (freeform instructions).
- **Document Parsing:** Uploads a document and extracts text, auto-filling the form via `/api/parse-document`.
- **Pipeline Execution (`runPipeline`):** 
  - Streams events from the backend using Server-Sent Events (SSE).
  - Updates the UI with an animated progress tracker and log output.
  - Automatically smooth-scrolls to the progress section on mobile (or on desktop if it's below the fold, though recently adjusted to only scroll on `window.innerWidth < 1024` to prevent desktop jumping glitches).
- **PDF Generation & Fallback Mechanics:**
  - Has a "Download PDF" button that triggers a backend LaTeX conversion (`/api/generate-latex-source`).
  - Converts markdown to LaTeX using an AI model (reads `modelSelection` from frontend).
  - Attempts to compile LaTeX into a PDF via an external compiler (`texlive.net`).
  - **Fallback:** Includes a 12-second abort timeout for the AI generation. If the LaTeX generation times out or compilation fails, it silently switches to a local JavaScript `html2pdf` renderer (avoiding scary error messages). It no longer downloads a raw `.tex` file on failure to avoid confusing non-technical users.

### 2. Backend (`server.js`)
- **API Server:** Express.js app running on port 3000.
- **Endpoints:**
  - `POST /api/parse-document`: Uses `multer` for file upload, extracts text (via `pdf-parse` or mammoth), and uses Gemini (`google/gemini-2.5-flash`) to extract JSON fields.
  - `POST /api/run-pipeline`: The core multi-agent execution that streams markdown chunks to the client via SSE. Uses `callModel` to interface with OpenRouter or Gemini.
  - `POST /api/custom-prompt`: Similar to `run-pipeline`, but uses user-provided freeform instructions.
  - `POST /api/generate-latex-source`: Uses Gemini or a selected model to securely escape and convert Markdown into a compilable `article` class LaTeX string.

## Recent Changes (Last Session)
1. **LaTeX Timeout & Fallback (UX Refinements):**
   - Implemented an `AbortController` in `index.html` to kill the LaTeX fetch request if it takes longer than 12 seconds.
   - Refined the catch blocks so that if LaTeX fails (or times out), it immediately generates the fast standard PDF via `html2pdf`.
   - Changed error toast messages into "info" messages (e.g., "Optimizing format. Generating fast standard PDF...").
   - Removed the behavior that downloaded the raw `.tex` file when LaTeX compilation failed, leaving only a pure PDF output.
2. **Scroll Glitch Fixed:** 
   - Wrapped `progressTracker.scrollIntoView` inside `if (window.innerWidth < 1024)` so desktop users clicking "Execute Pipeline" don't experience a jarring page jump.
3. **UI Loading States:** Added an animated "Downloading..." text loop to the PDF button to keep the user informed during the sometimes-long LaTeX AI generation phase.

## God Nodes
- `server.js`: The central orchestrator handling all API routes, model interactions, file parsing, and streaming.
- `public/index.html`: The monolithic frontend containing the UI, the state logic, and the fallback rendering.

## Surprising Connections
- The fallback PDF generation relies on a hidden `div` that parses the markdown into basic HTML, applies inline CSS styling, and passes it to the `html2pdf` client-side library. This provides a guaranteed offline backup to the remote LaTeX compiler.

## Suggested Questions
- How is the streaming response parsed into Markdown on the client side?
- What are the precise LaTeX packages and margins used in `/api/generate-latex-source`?
- How is the `AbourtController` integrated into the Server-Sent Events stream to allow users to halt generation?
