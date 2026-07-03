/**
 * Cloudflare Pages Function - Wedding Website API
 * Handles RSVP and Song Request operations with Airtable
 */

// Rate limiting storage (in-memory, resets on function restart)
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX_REQUESTS = 10;

export async function onRequest(context) {
    const { request, env } = context;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return handleCORS(env);
    }

    const url = new URL(request.url);
    const path = url.pathname;

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
        console.error('Function error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
    }
}

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

function checkRateLimit(clientIP) {
    const now = Date.now();
    const clientData = rateLimits.get(clientIP) || { count: 0, windowStart: now };

    if (now - clientData.windowStart > RATE_LIMIT_WINDOW) {
        clientData.count = 1;
        clientData.windowStart = now;
    } else {
        clientData.count++;
    }

    rateLimits.set(clientIP, clientData);
    return clientData.count <= RATE_LIMIT_MAX_REQUESTS;
}

async function verifyTurnstile(token, secretKey, ip) {
    if (!token || !secretKey) {
        return false;
    }

    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
        formData.append('remoteip', ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    return result.success === true;
}

async function handleValidateCode(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const body = await request.json();
    const { code, turnstileToken } = body;

    if (!code) {
        return jsonResponse({ error: 'Code is required' }, 400, corsHeaders);
    }

    if (env.TURNSTILE_SECRET_KEY) {
        const clientIP = request.headers.get('CF-Connecting-IP');
        const isValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIP);
        if (!isValid) {
            return jsonResponse({ error: 'Security verification failed. Please try again.' }, 403, corsHeaders);
        }
    }

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

    if (fields.Used) {
        return jsonResponse({
            error: 'This code has already been used. If you need to update your RSVP, please contact us.'
        }, 400, corsHeaders);
    }

    const guestNamesRaw = fields['Guest Names'] || '';
    const individualGuests = guestNamesRaw
        .split(/[,\n]/)
        .map(name => name.trim())
        .filter(name => name.length > 0);

    return jsonResponse({
        data: {
            recordId: record.id,
            names: fields['Guest Names'] || 'Guest',
            maxGuests: parseInt(fields['Max Guests']) || individualGuests.length || 1,
            individualGuests: individualGuests.length > 0 ? individualGuests : null
        }
    }, 200, corsHeaders);
}

async function handleSubmitRSVP(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const body = await request.json();
    const { code, attending, guestCount, attendingNames, dietary, notes, turnstileToken } = body;

    if (!code) {
        return jsonResponse({ error: 'Code is required' }, 400, corsHeaders);
    }

    if (attending === undefined) {
        return jsonResponse({ error: 'Attendance response is required' }, 400, corsHeaders);
    }

    // Note: Turnstile already verified during code validation step
    // Skipping here since tokens are single-use

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

    const updateData = {
        fields: {
            'Attending': attending ? 'Yes' : 'No',
            'Guest Count': attending ? (guestCount || 0) : 0,
            'Attending Names': attendingNames || '',
            'Dietary Restrictions': dietary || '',
            'Special Notes': notes || '',
            'Submission Date': new Date().toISOString().split('T')[0],
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

async function handleSubmitSong(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const body = await request.json();
    const { title, artist, genre, requester, turnstileToken } = body;

    if (!title || !artist) {
        return jsonResponse({ error: 'Song title and artist are required' }, 400, corsHeaders);
    }

    if (title.length > 100) {
        return jsonResponse({ error: 'Song title must be 100 characters or less' }, 400, corsHeaders);
    }
    if (artist.length > 100) {
        return jsonResponse({ error: 'Artist name must be 100 characters or less' }, 400, corsHeaders);
    }
    if (requester && requester.length > 50) {
        return jsonResponse({ error: 'Your name must be 50 characters or less' }, 400, corsHeaders);
    }

    if (env.TURNSTILE_SECRET_KEY) {
        const clientIP = request.headers.get('CF-Connecting-IP');
        const isValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIP);
        if (!isValid) {
            return jsonResponse({ error: 'Security verification failed. Please try again.' }, 403, corsHeaders);
        }
    }

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

function jsonResponse(data, status = 200, additionalHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...additionalHeaders
        }
    });
}
