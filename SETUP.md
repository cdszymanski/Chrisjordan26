# Wedding Website Setup Guide

Christopher & Jordan | September 19, 2026

## Project Structure

```
wedding-website/
├── index.html          # Home page (updated with navigation)
├── rsvp.html           # RSVP page
├── songs.html          # Song request page
├── css/
│   └── styles.css      # Shared stylesheet
├── js/
│   ├── rsvp.js         # RSVP functionality
│   └── songs.js        # Song request functionality
├── api/
│   └── worker.js       # Cloudflare Worker (API proxy)
├── scripts/
│   └── generate-codes.js  # Invite code generator
└── SETUP.md            # This file
```

## Quick Start (Testing Mode)

The site includes a test mode that works without any backend setup:

1. Open `index.html` in a browser (or serve with a local server)
2. Navigate to RSVP page
3. Enter test code: `1234`
4. The form will work with mock data

To disable test mode for production, edit `js/rsvp.js` and `js/songs.js`:
```javascript
const CONFIG = {
    testMode: false,  // Change to false
    // ...
};
```

---

## Step 1: Airtable Setup

### Create an Airtable Account
1. Go to https://airtable.com and sign up (free tier works)
2. Create a new base called "Wedding"

### Create RSVPs Table
Create a table named `RSVPs` with these fields:

| Field Name | Type | Notes |
|------------|------|-------|
| Code | Single line text | Primary field |
| Guest Names | Long text | Names of all guests in party |
| Max Guests | Number | Maximum party size |
| Attending | Single select | Options: Yes, No |
| Guest Count | Number | Actual attending count |
| Attending Names | Long text | Names of those attending |
| Dietary Restrictions | Long text | |
| Special Notes | Long text | |
| Submission Date | Date (include time) | |
| Used | Checkbox | Marks code as used |

### Create Song Requests Table
Create a table named `Song Requests` with these fields:

| Field Name | Type | Notes |
|------------|------|-------|
| Song Title | Single line text | Primary field |
| Artist | Single line text | |
| Genre | Single select | Options: Pop, Rock, Country, R&B, Hip-Hop, Dance, Classic, Other |
| Requester | Single line text | |
| Submission Date | Date (include time) | |

### Get API Credentials
1. Go to https://airtable.com/create/tokens
2. Click "Create new token"
3. Name: "Wedding Website"
4. Scopes: `data.records:read`, `data.records:write`
5. Access: Select your Wedding base
6. Copy the token (starts with `pat...`)
7. Get your Base ID from the URL: `https://airtable.com/BASE_ID/...`

---

## Step 2: Cloudflare Turnstile Setup

### Create Turnstile Widget
1. Go to https://dash.cloudflare.com
2. Navigate to Turnstile
3. Click "Add widget"
4. Settings:
   - Name: "Wedding RSVP"
   - Domains: `chrisjordan26.com` (and `localhost` for testing)
   - Widget Mode: Managed
5. Copy the **Site Key** and **Secret Key**

### Update HTML Files
In both `rsvp.html` and `songs.html`, replace `YOUR_TURNSTILE_SITE_KEY`:

```html
<div class="cf-turnstile" data-sitekey="YOUR_ACTUAL_SITE_KEY" ...>
```

---

## Step 3: Cloudflare Worker Deployment

### Option A: Cloudflare Dashboard

1. Go to https://dash.cloudflare.com
2. Navigate to Workers & Pages
3. Click "Create application" > "Create Worker"
4. Name: `wedding-api`
5. Click "Quick edit"
6. Paste contents of `api/worker.js`
7. Click "Save and deploy"

### Configure Environment Variables
1. Go to Worker settings > Variables
2. Add these variables (click "Encrypt" for sensitive ones):

| Variable | Value |
|----------|-------|
| AIRTABLE_API_KEY | Your Airtable token |
| AIRTABLE_BASE_ID | Your Airtable base ID |
| TURNSTILE_SECRET_KEY | Your Turnstile secret |
| ALLOWED_ORIGIN | https://chrisjordan26.com |

### Configure Route
1. Go to Worker > Triggers > Routes
2. Add route: `chrisjordan26.com/api/*`

### Option B: Wrangler CLI

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Create wrangler.toml in api/ directory
cat > api/wrangler.toml << EOF
name = "wedding-api"
main = "worker.js"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "https://chrisjordan26.com"

# Add secrets via CLI (more secure)
# wrangler secret put AIRTABLE_API_KEY
# wrangler secret put AIRTABLE_BASE_ID
# wrangler secret put TURNSTILE_SECRET_KEY
EOF

# Deploy
cd api && wrangler deploy

# Add secrets
wrangler secret put AIRTABLE_API_KEY
wrangler secret put AIRTABLE_BASE_ID
wrangler secret put TURNSTILE_SECRET_KEY
```

---

## Step 4: Generate Invite Codes

### Using the Generator Script

```bash
cd scripts

# Generate test code (1234)
node generate-codes.js --test

# Interactive mode - enter guests one by one
node generate-codes.js

# From a JSON file
node generate-codes.js guests.json

# Generate random codes for pre-population
node generate-codes.js --count 50
```

### Guest List JSON Format
Create a `guests.json` file:

```json
[
  { "names": "John & Jane Smith", "maxGuests": 2 },
  { "names": "Bob Johnson", "maxGuests": 1 },
  { "names": "The Wilson Family", "maxGuests": 5 },
  { "names": "Mike Brown, Sarah Brown, Tommy Brown", "maxGuests": 3 }
]
```

### Import to Airtable
1. Run the generator to create `invite-codes.csv`
2. In Airtable, go to RSVPs table
3. Click "..." menu > Import data > CSV file
4. Upload the CSV
5. Map columns to table fields

---

## Step 5: Deploy Static Site

### Option A: GitHub Pages (Current Setup)

1. Commit all files to `cdszymanski/Chrisjordan26` repo
2. Enable GitHub Pages in repo settings
3. Set custom domain to `chrisjordan26.com`

### Option B: Cloudflare Pages

1. Connect GitHub repo to Cloudflare Pages
2. Build settings: None (static site)
3. Configure custom domain

### File Structure for Deployment
Ensure these files are in your repo root:
```
index.html
rsvp.html
songs.html
css/styles.css
js/rsvp.js
js/songs.js
```

---

## Step 6: Configure Domain DNS

If using Cloudflare for DNS:

1. Add `A` record: `@` -> GitHub Pages IP (or Cloudflare Pages)
2. Add `CNAME` record: `www` -> `chrisjordan26.com`
3. Enable Cloudflare proxy (orange cloud)
4. SSL/TLS mode: Full (strict)

---

## Testing Checklist

### Local Testing
- [ ] Open index.html - navigation works
- [ ] RSVP page loads correctly
- [ ] Test code "1234" works in test mode
- [ ] Song request form displays
- [ ] All pages are mobile responsive

### Production Testing
- [ ] Turnstile widget appears and completes
- [ ] Valid RSVP code shows guest info
- [ ] Invalid code shows error message
- [ ] RSVP submission updates Airtable
- [ ] Song requests appear in Airtable
- [ ] Recent songs display on page
- [ ] All HTTPS, no mixed content

---

## Customization

### Changing Colors
Edit CSS variables in `css/styles.css`:
```css
:root {
    --gold-primary: #d4af37;
    --gold-light: #f4e5b8;
    --text-dark: #1a1a1a;
    /* ... */
}
```

### Changing Code Format
Edit `scripts/generate-codes.js`:
```javascript
const CODE_CONFIG = {
    letterCount: 4,    // Number of letters
    numberCount: 4,    // Number of numbers
    separator: '-',    // Separator character
    // ...
};
```

### Disabling Test Mode
Edit both `js/rsvp.js` and `js/songs.js`:
```javascript
const CONFIG = {
    testMode: false,
    // ...
};
```

---

## Troubleshooting

### "Invalid code" error
- Check code exists in Airtable RSVPs table
- Verify code is not marked as "Used"
- Codes are case-insensitive

### Turnstile not appearing
- Check site key is correct
- Verify domain is added to Turnstile widget
- Check browser console for errors

### API errors
- Check Worker is deployed and running
- Verify environment variables are set
- Check Airtable API token has correct permissions
- Check CORS (ALLOWED_ORIGIN must match your domain)

### Songs not loading
- Check "Song Requests" table exists (with space)
- Verify API has read permissions
- Check browser network tab for errors

---

## Security Notes

1. **API Token**: Never expose in client-side code
2. **Turnstile**: Always verify tokens server-side
3. **Rate Limiting**: Worker includes basic rate limiting (10 req/min)
4. **CORS**: Set ALLOWED_ORIGIN to your exact domain
5. **Code Reuse**: Codes are marked as "Used" after RSVP

---

## Support

For issues or questions:
- Check browser console for JavaScript errors
- Check Network tab for API failures
- Review Cloudflare Worker logs
- Check Airtable for data issues

Good luck with your special day!
