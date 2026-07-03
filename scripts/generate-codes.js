#!/usr/bin/env node

/**
 * Invite Code Generator for Wedding RSVP System
 * Christopher & Jordan Wedding Website
 *
 * Generates unique invite codes and outputs CSV for Airtable import
 *
 * Usage:
 *   node generate-codes.js                    # Interactive mode
 *   node generate-codes.js guests.json        # From JSON file
 *   node generate-codes.js --count 50         # Generate 50 random codes
 *
 * Output:
 *   Creates invite-codes.csv ready for Airtable import
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Code generation config
const CODE_CONFIG = {
    // Format: XXXX-#### (4 letters + 4 numbers)
    letterCount: 4,
    numberCount: 4,
    separator: '-',
    // Exclude confusing characters: 0, O, 1, I, L
    letters: 'ABCDEFGHJKMNPQRSTUVWXYZ',
    numbers: '23456789'
};

// Generate a single unique code
function generateCode(existingCodes = new Set()) {
    let code;
    let attempts = 0;
    const maxAttempts = 1000;

    do {
        let letterPart = '';
        let numberPart = '';

        for (let i = 0; i < CODE_CONFIG.letterCount; i++) {
            letterPart += CODE_CONFIG.letters[Math.floor(Math.random() * CODE_CONFIG.letters.length)];
        }

        for (let i = 0; i < CODE_CONFIG.numberCount; i++) {
            numberPart += CODE_CONFIG.numbers[Math.floor(Math.random() * CODE_CONFIG.numbers.length)];
        }

        code = `${letterPart}${CODE_CONFIG.separator}${numberPart}`;
        attempts++;

        if (attempts >= maxAttempts) {
            throw new Error('Unable to generate unique code after maximum attempts');
        }
    } while (existingCodes.has(code));

    existingCodes.add(code);
    return code;
}

// Parse guests from JSON file
function parseGuestsFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Expected format:
    // [
    //   { "names": "John & Jane Doe", "maxGuests": 2 },
    //   { "names": "Bob Smith, Mary Smith, Kids", "maxGuests": 4 }
    // ]

    return data.map(guest => ({
        names: guest.names || guest.name || 'Guest',
        maxGuests: guest.maxGuests || guest.max_guests || guest.count || 1
    }));
}

// Interactive mode - prompt for guests
async function interactiveMode() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    console.log('\n=== Wedding Invite Code Generator ===\n');
    console.log('Enter guest information (or type "done" to finish):\n');

    const guests = [];

    while (true) {
        const names = await question('Guest name(s) (or "done"): ');

        if (names.toLowerCase() === 'done') {
            break;
        }

        const maxGuestsStr = await question('Max guests in party: ');
        const maxGuests = parseInt(maxGuestsStr) || 1;

        guests.push({ names, maxGuests });
        console.log(`Added: ${names} (party of ${maxGuests})\n`);
    }

    rl.close();
    return guests;
}

// Generate codes for guest list
function generateCodesForGuests(guests) {
    const existingCodes = new Set();
    const results = [];

    for (const guest of guests) {
        const code = generateCode(existingCodes);
        results.push({
            code,
            names: guest.names,
            maxGuests: guest.maxGuests
        });
    }

    return results;
}

// Generate random codes (for testing or pre-generation)
function generateRandomCodes(count) {
    const existingCodes = new Set();
    const results = [];

    for (let i = 0; i < count; i++) {
        const code = generateCode(existingCodes);
        results.push({
            code,
            names: `Guest ${i + 1}`,
            maxGuests: 2
        });
    }

    return results;
}

// Create CSV content for Airtable import
function createCSV(codeData) {
    // CSV Headers matching Airtable structure
    const headers = [
        'Code',
        'Guest Names',
        'Max Guests',
        'Attending',
        'Guest Count',
        'Attending Names',
        'Dietary Restrictions',
        'Special Notes',
        'Submission Date',
        'Used'
    ];

    const rows = codeData.map(item => {
        // Escape quotes and commas in names
        const escapedNames = `"${item.names.replace(/"/g, '""')}"`;

        return [
            item.code,
            escapedNames,
            item.maxGuests,
            '', // Attending - empty until submitted
            '', // Guest Count - empty until submitted
            '', // Attending Names - empty until submitted
            '', // Dietary Restrictions - empty until submitted
            '', // Special Notes - empty until submitted
            '', // Submission Date - empty until submitted
            'false' // Used - false until submitted
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}

// Create JSON backup
function createJSON(codeData) {
    return JSON.stringify(codeData, null, 2);
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    let guests = [];

    console.log('\n========================================');
    console.log('  Wedding Invite Code Generator');
    console.log('  Christopher & Jordan - Sept 19, 2026');
    console.log('========================================\n');

    if (args.includes('--help') || args.includes('-h')) {
        console.log('Usage:');
        console.log('  node generate-codes.js                    Interactive mode');
        console.log('  node generate-codes.js guests.json        From JSON file');
        console.log('  node generate-codes.js --count 50         Generate 50 random codes');
        console.log('  node generate-codes.js --test             Generate test code (1234)');
        console.log('');
        console.log('JSON file format:');
        console.log('  [');
        console.log('    { "names": "John & Jane Doe", "maxGuests": 2 },');
        console.log('    { "names": "Bob Smith Family", "maxGuests": 4 }');
        console.log('  ]');
        process.exit(0);
    }

    // Test mode - generate a test entry with code 1234
    if (args.includes('--test')) {
        console.log('Generating test code (1234)...\n');
        const testData = [{
            code: '1234',
            names: 'Test Guest & Family',
            maxGuests: 4
        }];

        const csv = createCSV(testData);
        const csvPath = path.join(process.cwd(), 'test-code.csv');
        fs.writeFileSync(csvPath, csv);

        console.log('Test code generated!');
        console.log(`Code: 1234`);
        console.log(`Names: Test Guest & Family`);
        console.log(`Max Guests: 4`);
        console.log(`\nCSV saved to: ${csvPath}`);
        console.log('\nIMPORTANT: Import this CSV to your Airtable RSVPs table for testing.');
        process.exit(0);
    }

    // Count mode - generate random codes
    const countIndex = args.indexOf('--count');
    if (countIndex !== -1) {
        const count = parseInt(args[countIndex + 1]) || 10;
        console.log(`Generating ${count} random codes...\n`);
        const codeData = generateRandomCodes(count);

        const csv = createCSV(codeData);
        const json = createJSON(codeData);

        const csvPath = path.join(process.cwd(), 'invite-codes.csv');
        const jsonPath = path.join(process.cwd(), 'invite-codes.json');

        fs.writeFileSync(csvPath, csv);
        fs.writeFileSync(jsonPath, json);

        console.log(`Generated ${count} codes.`);
        console.log(`CSV saved to: ${csvPath}`);
        console.log(`JSON backup saved to: ${jsonPath}`);
        process.exit(0);
    }

    // File mode - read from JSON file
    if (args.length > 0 && args[0].endsWith('.json')) {
        const filePath = args[0];
        if (!fs.existsSync(filePath)) {
            console.error(`Error: File not found: ${filePath}`);
            process.exit(1);
        }

        console.log(`Reading guests from: ${filePath}\n`);
        try {
            guests = parseGuestsFromFile(filePath);
        } catch (error) {
            console.error(`Error parsing JSON file: ${error.message}`);
            process.exit(1);
        }
    } else {
        // Interactive mode
        guests = await interactiveMode();
    }

    if (guests.length === 0) {
        console.log('No guests entered. Exiting.');
        process.exit(0);
    }

    // Generate codes
    console.log(`\nGenerating codes for ${guests.length} parties...\n`);
    const codeData = generateCodesForGuests(guests);

    // Display results
    console.log('Generated Codes:');
    console.log('================');
    codeData.forEach(item => {
        console.log(`  ${item.code} - ${item.names} (party of ${item.maxGuests})`);
    });

    // Save to files
    const csv = createCSV(codeData);
    const json = createJSON(codeData);

    const csvPath = path.join(process.cwd(), 'invite-codes.csv');
    const jsonPath = path.join(process.cwd(), 'invite-codes.json');

    fs.writeFileSync(csvPath, csv);
    fs.writeFileSync(jsonPath, json);

    console.log('\n================');
    console.log(`Total codes generated: ${codeData.length}`);
    console.log(`CSV saved to: ${csvPath}`);
    console.log(`JSON backup saved to: ${jsonPath}`);
    console.log('\nNext steps:');
    console.log('1. Open your Airtable base');
    console.log('2. Go to the RSVPs table');
    console.log('3. Click "..." menu > Import data > CSV file');
    console.log('4. Upload invite-codes.csv');
    console.log('5. Map columns appropriately');
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
