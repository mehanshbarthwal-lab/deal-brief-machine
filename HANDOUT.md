# Deal Brief Machine - Project Handout

This document serves as a continuously updated summary of everything we have built and accomplished in the Deal Brief Machine project. It outlines the architecture, key features, and technical decisions made during our sessions.

## 🌟 Project Overview
The Deal Brief Machine is an advanced, AI-powered internal tool designed for **Fuse Capital**. It allows investment advisors to input basic details about a potential deal (company name, rationale, metrics) and automatically routes those details through a multi-agent AI pipeline to generate a comprehensive, highly professional Deal Brief slide deck.

## 🎨 Frontend & UI/UX (Aesthetics)
- **Glassmorphism Design:** The entire interface is built using premium, dark-mode glassmorphism (translucent panels, background blurring, glowing borders) to look like a high-end, modern SaaS application.
- **Cinematic Video Background:** The background features a custom-generated, slow-motion 3D motion graphic loop of a translucent node network. The cyan/teal accents perfectly match Fuse Capital's brand identity.
- **Dynamic Progress Tracker:** When the pipeline runs, a multi-step tracker appears, providing real-time visual feedback on which AI agent (Context Analysis, Structural Planning, Drafting, PDF Generation) is currently active.
- **Toast Notifications:** A sleek, animated toast notification slides in from the top right to alert the user of important system events (e.g., if the AI engine is rate-limited and falls back to a backup model, or if the pipeline is halted).

## 🧠 AI Engine & Model Routing
- **Multi-Model Support:** The application integrates with OpenRouter, allowing users to select their preferred AI engine:
  - **Auto (Smart Routing):** Uses Google Gemma for logic/structuring and OpenAI GPT for prose generation.
  - **Google Gemma 4 31B (Pure)**
  - **OpenAI GPT-OSS 20B (Pure)**
  - **Meta LLaMA 3.1 8B (Pure)**
- **Automatic Fallback Protection:** If the selected AI model hits a 429 Rate Limit on OpenRouter, the backend intercepts the failure, automatically switches to a highly reliable backup model (like Llama 3 8B), and continues the pipeline seamlessly without crashing. The user is notified via a Toast.

## ⚙️ Backend Architecture (Node.js/Express)
- **4-Step Agentic Pipeline:**
  - **Step 1:** Ingests raw form data and expands it into comprehensive context.
  - **Step 2:** Structures the context into a logical deal brief outline.
  - **Step 3:** Drafts the professional content for the pitchbook.
  - **Step 4:** Finalizes the content into clean Markdown.
- **AbortController / Pipeline Halt:** The frontend is equipped with a native JavaScript `AbortController`. If a user clicks the red "Halt Pipeline" button, it severs the connection to the backend, immediately stopping all AI agents to save tokens and time.

## 📑 Professional PDF Generation (Beamer)
- **LaTeX to Slide Deck:** The backend utilizes LaTeX to generate the final output. Instead of a generic text document, we implemented the `beamer` document class with the `Boadilla` theme and `Whale` color palette to generate a **professional, blue-accented corporate slide deck**.
- **Smart Markdown Parsing:** The backend parses the AI-generated Markdown and intelligently converts `## Headers` into new slide boundaries (`\begin{frame}`), automatically structuring the Deal Brief into a logical presentation format.
- **Robust Escaping:** Special characters (like `£`, `%`, `&`, `$`) are safely escaped in the backend to ensure the LaTeX compiler never crashes on financial metrics.

---

## 📁 Document Extraction & Context Ingestion
- **Multi-Format Parsing:** Integrated `pdf-parse` and `mammoth` libraries to extract raw text from `.pdf` and `.docx` (Microsoft Word) files on the backend.
- **Auto-Fill Mechanism:** If the user is in Structured Mode, the backend uses AI to intelligently map the extracted document text directly into the Deal Brief form inputs (Company, Financials, Deal Size, etc.) automatically.

## 🎛️ Dual-Mode Pipeline
- **Structured Mode:** The default, rigid 4-step pipeline that guarantees consistent, professional formatting based on strict deal parameters.
- **Custom Mode:** Allows users to write a freeform prompt (e.g., "Analyze this 30-page PDF and write a brief highlighting the SaaS churn rate"). Bypasses the 4-step pipeline and directly instructs the AI to generate a Markdown slide deck tailored exactly to the user's specific prompt, leveraging the uploaded document as raw context.

## ✨ Evolved UI States
- **Terminal Placeholder:** Replaced the static, empty right-hand column with a highly polished "Awaiting Instructions" terminal state, featuring glowing SVG rings, rotating micro-animations (`animate-spin`, `animate-ping`), and deep glassmorphism to make the UI feel reactive and premium even when dormant.
- **Mode Toggle:** Added a sleek, animated pill-toggle to instantly switch between Structured and Custom pipelines without reloading the page.

---
*This document will be continuously updated as we add new features and refine the application.*
