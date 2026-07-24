require('dotenv').config();
const fetch = require('node-fetch');

async function test() {
    const data = {
        company: "NovaBuild Technologies, a UK-based proptech SaaS business",
        what_they_do: "AI-driven project management platform for construction firms",
        financials: "£8.5m ARR, growing 65% YoY, not yet profitable (EBITDA -£1.2m)",
        deal_type: "Growth financing to accelerate expansion into the US market",
        deal_size: "£6m",
        preferred_structure: "Senior secured debt with a 4-year tenor",
        additional_context: "Founder-led, 3 institutional investors on the cap table, strong NPS"
    };
    
    try {
        const response = await fetch('http://localhost:3000/api/generate-brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
