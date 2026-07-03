/**
 * Cloudflare Worker - Wedding Website API Proxy
 * Handles RSVP and Song Request operations with Airtable
 *
 * Environment Variables Required:
 * - AIRTABLE_API_KEY: Your Airtable Personal Access Token
 * - AIRTABLE_BASE_ID: Your Airtable Base ID
 * - ALLOWED_ORIGIN: Your website domain (e.g., https://chrisjordan26.com)
 */

// Rate limiting storage (in-memory, resets on worker restart)
const rateLimits = new Map();

// Constants
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max requests per window

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleCORS(env);
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // Add CORS headers to all responses
        const corsHeaders = {
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        try {
            // Rate limiting
            const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
            if (!checkRateLimit(clientIP)) {
                return jsonResponse({ error: 'Too many requests. Please wait a moment.' }, 429, corsHeaders);
            }

            // Route handling
            switch (path) {
                case '/api/validate-code':
                    return await handleValidateCode(request, env, corsHeaders);

                case '/api/submit-rsvp':
                    return await handleSubmitRSVP(request, env, corsHeaders);

                case '/api/recent-songs':
                    return await handleRecentSongs(request, env, corsHeaders);

                case '/api/submit-song':
                    return await handleSubmitSong(request, env, corsHeaders);

                default:
                    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
            }
        } catch (error) {
            console.error('Worker error:', error);
            return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
        }
    }
};

// CORS preflight handler
function handleCORS(env) {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        }
    });
}

// Rate limiting check
function checkRateLimit(clientIP) {
    const now = Date.now();
    const clientData = rateLimits.get(clientIP) || { count: 0, windowStart: now };

    if (now - clientData.windowStart > RATE_LIMIT_WINDOW) {
        // Reset window
        clientData.count = 1;
        clientData.windowStart = now;
    } else {
        clientData.count++;
    }

    rateLimits.set(clientIP, clientData);

    return clientData.count <= RATE_LIMIT_MAX_REQUESTS;
}

// Validate RSVP Code
async function handleValidateCode(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const body = await request.json();
    const { code } = body;

    if (!code) {
        return jsonResponse({ error: 'Code is required' }, 400, corsHeaders);
    }

    // Query Airtable for the code (case-insensitive via formula)
    const normalizedCode = code.toLowerCase();
    const filterFormula = encodeURIComponent(`LOWER({Code}) = "${normalizedCode}"`);

    const airtableResponse = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/RSVPs?filterByFormula=${filterFormula}&maxRecords=1`,
        {
            headers: {
                'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );

    if (!airtableResponse.ok) {
        console.error('Airtable error:', await airtableResponse.text());
        return jsonResponse({ error: 'Unable to verify code. Please try again.' }, 500, corsHeaders);
    }

    const airtableData = await airtableResponse.json();

    if (!airtableData.records || airtableData.records.length === 0) {
        return jsonResponse({ error: 'Invalid code. Please check your invitation and try again.' }, 404, corsHeaders);
    }

    const record = airtableData.records[0];
    const fields = record.fields;

    // Check if code is already used
    if (fields.Used) {
        return jsonResponse({
            error: 'This code has already been used. If you need to update your RSVP, please contact us.'
        }, 400, corsHeaders);
    }

    // Parse guest names - expect comma-separated or newline-separated names
    const guestNamesRaw = fields['Guest Names'] || '';
    const individualGuests = guestNamesRaw
        .split(/[,\n]/)
        .map(name => name.trim())
        .filter(name => name.length > 0);

    // Return guest information
    return jsonResponse({
        data: {
            recordId: record.id,
            names: fields['Guest Names'] || 'Guest',
            maxGuests: parseInt(fields['Max Guests']) || individualGuests.length || 1,
            individualGuests: individualGuests.length > 0 ? individualGuests : null
        }
    }, 200, corsHeaders);
}

// Submit RSVP
async function handleSubmitRSVP(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const body = await request.json();
    const { code, attending, guestCount, attendingNames, dietary, notes } = body;

    if (!code) {
        return jsonResponse({ error: 'Code is required' }, 400, corsHeaders);
    }

    if (attending === undefined) {
        return jsonResponse({ error: 'Attendance response is required' }, 400, corsHeaders);
    }

    // Find the record by code
    const normalizedCode = code.toLowerCase();
    const filterFormula = encodeURIComponent(`LOWER({Code}) = "${normalizedCode}"`);

    const findResponse = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/RSVPs?filterByFormula=${filterFormula}&maxRecords=1`,
        {
            headers: {
                'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );

    if (!findResponse.ok) {
        return jsonResponse({ error: 'Unable to process RSVP. Please try again.' }, 500, corsHeaders);
    }

    const findData = await findResponse.json();

    if (!findData.records || findData.records.length === 0) {
        return jsonResponse({ error: 'Invalid code' }, 404, corsHeaders);
    }

    const recordId = findData.records[0].id;

    // Update the record
    const updateData = {
        fields: {
            'Attending': attending ? 'Yes' : 'No',
            'Guest Count': attending ? (guestCount || 0) : 0,
            'Attending Names': attendingNames || '',
            'Dietary Restrictions': dietary || '',
            'Special Notes': notes || '',
            'Submission Date': new Date().toISOString(),
            'Used': true
        }
    };

    const updateResponse = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/RSVPs/${recordId}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        }
    );

    if (!updateResponse.ok) {
        console.error('Airtable update error:', await updateResponse.text());
        return jsonResponse({ error: 'Failed to save RSVP. Please try again.' }, 500, corsHeaders);
    }

    return jsonResponse({ success: true, message: 'RSVP submitted successfully' }, 200, corsHeaders);
}

// Get Recent Songs
async function handleRecentSongs(request, env, corsHeaders) {
    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const airtableResponse = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/Song%20Requests?maxRecords=10&sort[0][field]=Submission%20Date&sort[0][direction]=desc`,
        {
            headers: {
                'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );

    if (!airtableResponse.ok) {
        console.error('Airtable error:', await airtableResponse.text());
        return jsonResponse({ error: 'Unable to load songs' }, 500, corsHeaders);
    }

    const airtableData = await airtableResponse.json();

    const songs = (airtableData.records || []).map(record => ({
        title: record.fields['Song Title'] || '',
        artist: record.fields['Artist'] || '',
        genre: record.fields['Genre'] || null
    }));

    return jsonResponse({ data: songs }, 200, corsHeaders);
}

// Submit Song Request
async function handleSubmitSong(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const body = await request.json();
    const { title, artist, genre, requester } = body;

    if (!title || !artist) {
        return jsonResponse({ error: 'Song title and artist are required' }, 400, corsHeaders);
    }

    // Validate lengths
    if (title.length > 100) {
        return jsonResponse({ error: 'Song title must be 100 characters or less' }, 400, corsHeaders);
    }
    if (artist.length > 100) {
        return jsonResponse({ error: 'Artist name must be 100 characters or less' }, 400, corsHeaders);
    }
    if (requester && requester.length > 50) {
        return jsonResponse({ error: 'Your name must be 50 characters or less' }, 400, corsHeaders);
    }

    // Create the record in Airtable
    const createData = {
        fields: {
            'Song Title': title.trim(),
            'Artist': artist.trim(),
            'Genre': genre || null,
            'Requester': requester ? requester.trim() : null,
            'Submission Date': new Date().toISOString()
        }
    };

    const createResponse = await fetch(
        `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/Song%20Requests`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(createData)
        }
    );

    if (!createResponse.ok) {
        console.error('Airtable create error:', await createResponse.text());
        return jsonResponse({ error: 'Failed to submit song request. Please try again.' }, 500, corsHeaders);
    }

    return jsonResponse({ success: true, message: 'Song request submitted successfully' }, 200, corsHeaders);
}

// JSON response helper
function jsonResponse(data, status = 200, additionalHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...additionalHeaders
        }
    });
}
