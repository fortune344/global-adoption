/* ============================================
   Global Adoption – Backend Server (Supabase)
   ============================================ */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fileUpload = require('express-fileupload');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3002;

// Trust proxy for correct req.ip behind reverse proxies (Render, Railway, etc.)
app.set('trust proxy', 1);

// --- Initialize Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY in environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Admin credentials ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_PASS) {
    console.warn('⚠️  WARNING: ADMIN_PASS not set in .env. Set it to protect the admin panel.');
}

// --- Middleware ---
// Serve ONLY the public/ directory as static files (not the project root)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure file uploads (store in memory for direct upload to Supabase)
app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    abortOnLimit: true,
}));

// --- Rate limiter (simple in-memory) ---
const rateLimitStore = {};

function rateLimiter(windowMs, maxRequests) {
    return (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();
        if (!rateLimitStore[ip]) rateLimitStore[ip] = [];
        rateLimitStore[ip] = rateLimitStore[ip].filter(t => now - t < windowMs);
        if (rateLimitStore[ip].length >= maxRequests) {
            return res.status(429).json({ error: 'Trop de requêtes. Réessayez plus tard.' });
        }
        rateLimitStore[ip].push(now);
        next();
    };
}

// Clean up rate limit store every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const ip of Object.keys(rateLimitStore)) {
        rateLimitStore[ip] = rateLimitStore[ip].filter(t => now - t < 600000);
        if (rateLimitStore[ip].length === 0) delete rateLimitStore[ip];
    }
}, 600000);

// --- Admin authentication middleware (HTTP Basic Auth) ---
function adminAuth(req, res, next) {
    if (!ADMIN_PASS) {
        return res.status(503).send('Admin panel not configured. Set ADMIN_PASS in .env');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Authentification requise' });
    }

    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const colonIndex = credentials.indexOf(':');
    if (colonIndex === -1) return res.status(401).json({ error: 'Identifiants invalides' });
    const user = credentials.substring(0, colonIndex);
    const pass = credentials.substring(colonIndex + 1);

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        return next();
    }

    return res.status(401).json({ error: 'Identifiants invalides' });
}

// --- File validation ---
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

function validateUploadedFile(file) {
    const ext = path.extname(file.name).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIME_TYPES.includes(file.mimetype);
}

// --- Helper: upload file to Supabase Storage ---
async function uploadToSupabase(file, ref, folderName) {
    if (!file) return null;

    if (!validateUploadedFile(file)) {
        throw new Error(`Type de fichier non autorisé pour ${folderName}. Formats acceptés : PDF, JPG, PNG.`);
    }

    const ext = path.extname(file.name).toLowerCase();
    const filename = `${ref}/${folderName}_${Date.now()}${ext}`;

    const { data, error } = await supabase
        .storage
        .from('applications_docs')
        .upload(filename, file.data, {
            contentType: file.mimetype,
            upsert: false
        });

    if (error) {
        throw new Error(`Échec de l'upload ${folderName}: ${error.message}`);
    }

    // Get the public URL
    const { data: publicUrlData } = supabase
        .storage
        .from('applications_docs')
        .getPublicUrl(filename);

    return publicUrlData.publicUrl;
}

// --- Server-side input validation ---
function validateSubmission(body) {
    const errors = [];
    const b = body;

    if (!b.fullName || !b.fullName.trim()) errors.push('Nom complet requis');
    if (!b.dob) errors.push('Date de naissance requise');
    if (!b.pob || !b.pob.trim()) errors.push('Lieu de naissance requis');
    if (!b.nationality || !b.nationality.trim()) errors.push('Nationalité requise');

    const validMarital = ['single', 'married', 'civil_union', 'divorced', 'widowed'];
    if (!b.maritalStatus || !validMarital.includes(b.maritalStatus)) errors.push('État civil invalide');

    if (!b.address || !b.address.trim()) errors.push('Adresse requise');
    if (!b.phone || !b.phone.trim()) errors.push('Téléphone requis');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!b.email || !emailRegex.test(b.email)) errors.push('E-mail invalide');

    if (!b.profession || !b.profession.trim()) errors.push('Profession requise');
    if (!b.employer || !b.employer.trim()) errors.push('Employeur requis');

    const validHousing = ['apartment', 'house', 'other'];
    if (!b.housingType || !validHousing.includes(b.housingType)) errors.push('Type de logement invalide');

    if (!b.motivation || !b.motivation.trim()) errors.push('Motivation requise');
    if (b.motivation && b.motivation.length > 2000) errors.push('Motivation trop longue (max 2000 caractères)');

    const validAdoption = ['national', 'international'];
    if (!b.adoptionType || !validAdoption.includes(b.adoptionType)) errors.push("Type d'adoption invalide");

    const validAges = ['0-1', '1-3', '3-6', '6-10', '10+', 'no_preference'];
    if (!b.preferredAge || !validAges.includes(b.preferredAge)) errors.push('Âge préféré invalide');

    if (!b.signature || !b.signature.trim()) errors.push('Signature requise');
    if (!b.signatureDate) errors.push('Date de signature requise');

    // Age validation (21+)
    if (b.dob) {
        const dob = new Date(b.dob);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        if (age < 21) errors.push('Vous devez avoir au moins 21 ans');
    }

    return errors;
}

// --- API: Submit application (rate limited: 5 per minute) ---
app.post('/api/submit', rateLimiter(60000, 5), async (req, res) => {
    try {
        const b = req.body;

        // Server-side validation
        const validationErrors = validateSubmission(b);
        if (validationErrors.length > 0) {
            return res.status(400).json({ success: false, message: validationErrors.join(', ') });
        }

        // Ensure files are present
        if (!req.files || !req.files.idDocument || !req.files.proofAddress || !req.files.financialCert) {
            return res.status(400).json({ success: false, message: 'Documents requis manquants.' });
        }

        // Generate reference number
        const ref = 'GA-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Upload files
        const docIdentityUrl = await uploadToSupabase(req.files.idDocument, ref, 'idDocument');
        const docProofAddressUrl = await uploadToSupabase(req.files.proofAddress, ref, 'proofAddress');
        const docFinancialUrl = await uploadToSupabase(req.files.financialCert, ref, 'financialCert');

        // Insert into Supabase table
        const { data, error } = await supabase
            .from('applications')
            .insert([
                {
                    ref: ref,
                    full_name: b.fullName.trim(),
                    date_of_birth: b.dob,
                    place_of_birth: b.pob.trim(),
                    nationality: b.nationality.trim(),
                    marital_status: b.maritalStatus,
                    address: b.address.trim(),
                    phone: b.phone.trim(),
                    email: b.email.trim().toLowerCase(),
                    dependent_children: parseInt(b.dependentChildren) || 0,
                    profession: b.profession.trim(),
                    employer: b.employer.trim(),
                    income: parseFloat(b.income) || 0,
                    housing_type: b.housingType,
                    motivation: b.motivation.trim(),
                    adoption_type: b.adoptionType,
                    preferred_age: b.preferredAge,
                    preferred_gender: b.preferredGender || null,
                    preferred_country: b.preferredCountry ? b.preferredCountry.trim() : null,
                    special_needs: b.specialNeeds || 'no',
                    special_needs_details: b.specialNeedsSpec ? b.specialNeedsSpec.trim() : null,
                    signature: b.signature.trim(),
                    signature_date: b.signatureDate,
                    doc_identity: docIdentityUrl,
                    doc_proof_address: docProofAddressUrl,
                    doc_financial: docFinancialUrl,
                    status: 'Pending'
                }
            ]);

        if (error) {
            console.error('Supabase DB Insert Error:', error);
            return res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement." });
        }

        res.json({ success: true, ref });
    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- Protected admin routes ---

// Serve admin page (login is handled client-side)
app.get('/admin', (req, res) => {
    res.sendFile('admin.html', { root: __dirname });
});

// Login check endpoint (rate limited: 10 attempts per 15 minutes)
app.post('/api/admin/login', rateLimiter(900000, 10), (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
});

// Get all applications (admin only)
app.get('/api/applications', adminAuth, async (req, res) => {
    try {
        const { data: applications, error } = await supabase
            .from('applications')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            console.error('Error fetching applications:', error);
            return res.status(500).json({ error: 'Failed to fetch applications' });
        }

        res.json(applications || []);
    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single application (admin only)
app.get('/api/applications/:id', adminAuth, async (req, res) => {
    try {
        const { data: application, error } = await supabase
            .from('applications')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !application) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.json(application);
    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update application status (admin only)
app.patch('/api/applications/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Pending', 'Under Review', 'Approved', 'Rejected', 'On Hold'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const { error } = await supabase
            .from('applications')
            .update({ status: status })
            .eq('id', req.params.id);

        if (error) {
            console.error('Error updating status:', error);
            return res.status(500).json({ error: 'Failed to update status' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to extract path from Supabase public URL
function getStoragePathFromUrl(publicUrl) {
    if (!publicUrl) return null;
    const parts = publicUrl.split('/applications_docs/');
    if (parts.length > 1) {
        return parts[1];
    }
    return null;
}

// Delete application (admin only)
app.delete('/api/applications/:id', adminAuth, async (req, res) => {
    try {
        // 1. Fetch the application to get file URLs
        const { data: application, error: fetchError } = await supabase
            .from('applications')
            .select('doc_identity, doc_proof_address, doc_financial')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // 2. Prepare files for deletion from storage
        const filesToDelete = [];
        const identityPath = getStoragePathFromUrl(application.doc_identity);
        if (identityPath) filesToDelete.push(identityPath);

        const proofPath = getStoragePathFromUrl(application.doc_proof_address);
        if (proofPath) filesToDelete.push(proofPath);

        const financialPath = getStoragePathFromUrl(application.doc_financial);
        if (financialPath) filesToDelete.push(financialPath);

        // 3. Delete files from storage
        if (filesToDelete.length > 0) {
            const { error: storageError } = await supabase
                .storage
                .from('applications_docs')
                .remove(filesToDelete);

            if (storageError) {
                console.error('Error deleting files from storage:', storageError);
            }
        }

        // 4. Delete DB record
        const { error: deleteError } = await supabase
            .from('applications')
            .delete()
            .eq('id', req.params.id);

        if (deleteError) {
            console.error('Error deleting DB record:', deleteError);
            return res.status(500).json({ error: 'Failed to delete record' });
        }

        res.json({ success: true });

    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Internal server error during deletion' });
    }
});

// --- Start server ---
app.listen(PORT, () => {
    console.log(`\n  Global Adoption Server running!`);
    console.log(`  Application form: http://localhost:${PORT}`);
    console.log(`  Admin panel:      http://localhost:${PORT}/admin`);
    console.log(`  API:              http://localhost:${PORT}/api/applications\n`);
});
