/* ============================================
   Global Adoption – Form Logic & Validation
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // --- State ---
    let currentStep = 1;
    const totalSteps = 5;

    // --- DOM Elements ---
    const form = document.getElementById('adoptionForm');
    const sections = document.querySelectorAll('.form-section');
    const steps = document.querySelectorAll('.step');
    const progressFill = document.getElementById('progressFill');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const successModal = document.getElementById('successModal');
    const motivationField = document.getElementById('motivation');
    const motivationCount = document.getElementById('motivationCount');
    const signatureDate = document.getElementById('signatureDate');

    // --- Initialize ---
    setTodayDate();
    setupFileUploads();
    setupSpecialNeeds();
    setupCharCount();
    updateNavigation();

    // --- Set today's date as default ---
    function setTodayDate() {
        const today = new Date().toISOString().split('T')[0];
        if (signatureDate) {
            signatureDate.value = today;
        }
    }

    // --- Character counter for motivation ---
    function setupCharCount() {
        if (motivationField) {
            motivationField.addEventListener('input', () => {
                const count = motivationField.value.length;
                motivationCount.textContent = count;
                if (count > 2000) {
                    motivationField.value = motivationField.value.substring(0, 2000);
                    motivationCount.textContent = 2000;
                }
            });
        }
    }

    // --- File upload visual feedback ---
    function setupFileUploads() {
        document.querySelectorAll('.file-upload input[type="file"]').forEach(input => {
            input.addEventListener('change', function () {
                const wrapper = this.closest('.file-upload');
                const nameSpan = wrapper.querySelector('.file-name');
                if (this.files.length > 0) {
                    const file = this.files[0];
                    // Validate file size (5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        showError(this.id, 'Le fichier doit peser moins de 5 Mo.');
                        this.value = '';
                        wrapper.classList.remove('has-file');
                        nameSpan.textContent = '';
                        return;
                    }
                    wrapper.classList.add('has-file');
                    nameSpan.textContent = '✓ ' + file.name;
                    clearError(this.id);
                } else {
                    wrapper.classList.remove('has-file');
                    nameSpan.textContent = '';
                }
            });
        });
    }

    // --- Special needs toggle ---
    function setupSpecialNeeds() {
        document.querySelectorAll('input[name="specialNeeds"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const details = document.getElementById('specialNeedsDetails');
                if (this.value === 'yes') {
                    details.classList.remove('hidden');
                } else {
                    details.classList.add('hidden');
                }
            });
        });
    }

    // --- Navigation ---
    nextBtn.addEventListener('click', () => {
        if (validateSection(currentStep)) {
            goToStep(currentStep + 1);
        }
    });

    prevBtn.addEventListener('click', () => {
        goToStep(currentStep - 1);
    });

    function goToStep(step) {
        if (step < 1 || step > totalSteps) return;

        // Mark completed steps
        if (step > currentStep) {
            steps[currentStep - 1].classList.add('completed');
            steps[currentStep - 1].classList.remove('active');
        }

        // Update active section
        sections.forEach(s => s.classList.remove('active'));
        sections[step - 1].classList.add('active');

        // Update step indicators
        steps.forEach((s, i) => {
            if (i < step - 1) {
                s.classList.add('completed');
                s.classList.remove('active');
            } else if (i === step - 1) {
                s.classList.add('active');
                s.classList.remove('completed');
            } else {
                s.classList.remove('active', 'completed');
            }
        });

        currentStep = step;
        updateNavigation();
        updateProgress();

        // Scroll to top of form
        document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateNavigation() {
        prevBtn.style.display = currentStep > 1 ? 'inline-flex' : 'none';
        nextBtn.style.display = currentStep < totalSteps ? 'inline-flex' : 'none';
        submitBtn.style.display = currentStep === totalSteps ? 'inline-flex' : 'none';
    }

    function updateProgress() {
        const pct = (currentStep / totalSteps) * 100;
        progressFill.style.width = pct + '%';
    }

    // --- Validation ---
    function validateSection(step) {
        let isValid = true;

        // Clear previous errors in this section
        const section = sections[step - 1];
        section.querySelectorAll('.error-msg').forEach(el => {
            el.textContent = '';
            el.classList.remove('visible');
        });
        section.querySelectorAll('.error').forEach(el => {
            el.classList.remove('error');
        });

        if (step === 1) {
            isValid = validateRequired('fullName', 'Le nom complet est requis.') && isValid;
            isValid = validateRequired('dob', 'La date de naissance est requise.') && isValid;
            isValid = validateRequired('pob', 'Le lieu de naissance est requis.') && isValid;
            isValid = validateRequired('nationality', 'La nationalité est requise.') && isValid;
            isValid = validateRequired('maritalStatus', 'Veuillez sélectionner votre état civil.') && isValid;
            isValid = validateRequired('address', 'L\'adresse est requise.') && isValid;
            isValid = validateRequired('phone', 'Le numéro de téléphone est requis.') && isValid;
            isValid = validateEmail() && isValid;

            // Validate age (must be at least 21)
            const dobVal = document.getElementById('dob').value;
            if (dobVal) {
                const age = getAge(new Date(dobVal));
                if (age < 21) {
                    showError('dob', 'Vous devez avoir au moins 21 ans pour postuler.');
                    isValid = false;
                }
            }
        }

        if (step === 2) {
            isValid = validateRequired('dependentChildren', 'Ce champ est requis.') && isValid;
            isValid = validateRequired('profession', 'La profession est requise.') && isValid;
            isValid = validateRequired('employer', 'L\'employeur ou l\'activité est requis.') && isValid;
            isValid = validateRequired('income', 'Le revenu est requis.') && isValid;

            // Validate housing radio
            const housing = document.querySelector('input[name="housingType"]:checked');
            if (!housing) {
                showError('housingType', 'Veuillez sélectionner un type de logement.');
                isValid = false;
            }
        }

        if (step === 3) {
            isValid = validateRequired('motivation', 'Veuillez partager vos motivations.') && isValid;
            isValid = validateRequired('adoptionType', 'Veuillez sélectionner le type d\'adoption.') && isValid;
            isValid = validateRequired('preferredAge', 'Veuillez sélectionner une tranche d\'âge.') && isValid;

            const specialNeeds = document.querySelector('input[name="specialNeeds"]:checked');
            if (!specialNeeds) {
                showError('specialNeeds', 'Veuillez répondre à cette question.');
                isValid = false;
            }
        }

        if (step === 4) {
            isValid = validateFile('idDocument', 'La pièce d\'identité est requise.') && isValid;
            isValid = validateFile('proofAddress', 'Le justificatif de domicile est requis.') && isValid;
            isValid = validateFile('financialCert', 'L\'attestation financière ou professionnelle est requise.') && isValid;
        }

        if (step === 5) {
            const declaration = document.getElementById('declaration');
            if (!declaration.checked) {
                showError('declaration', 'Vous devez accepter la déclaration.');
                isValid = false;
            }
            isValid = validateRequired('signature', 'Veuillez taper votre nom complet comme signature.') && isValid;
            isValid = validateRequired('signatureDate', 'La date est requise.') && isValid;
        }

        return isValid;
    }

    function validateRequired(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return true;
        if (!field.value || field.value.trim() === '') {
            showError(fieldId, message);
            return false;
        }
        clearError(fieldId);
        return true;
    }

    function validateEmail() {
        const email = document.getElementById('email');
        if (!email.value || email.value.trim() === '') {
            showError('email', 'L\'adresse e-mail est requise.');
            return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.value)) {
            showError('email', 'Veuillez entrer une adresse e-mail valide.');
            return false;
        }
        clearError('email');
        return true;
    }

    function validateFile(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field || field.files.length === 0) {
            showError(fieldId, message);
            return false;
        }
        clearError(fieldId);
        return true;
    }

    function showError(fieldId, message) {
        const errorEl = document.getElementById(fieldId + 'Error');
        const field = document.getElementById(fieldId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
        }
        if (field) {
            field.classList.add('error');
        }
    }

    function clearError(fieldId) {
        const errorEl = document.getElementById(fieldId + 'Error');
        const field = document.getElementById(fieldId);
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.remove('visible');
        }
        if (field) {
            field.classList.remove('error');
        }
    }

    function getAge(birthday) {
        const today = new Date();
        let age = today.getFullYear() - birthday.getFullYear();
        const m = today.getMonth() - birthday.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthday.getDate())) {
            age--;
        }
        return age;
    }

    // --- Form submission ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateSection(5)) return;

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>
            Envoi en cours…
        `;

        // Collect all form data (text + files)
        const formData = new FormData(form);

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                document.getElementById('refNumber').textContent = result.ref;
                successModal.classList.add('show');
            } else {
                alert('Une erreur est survenue lors de la soumission de votre demande. Veuillez réessayer.\n\nErreur : ' + (result.message || 'Erreur inconnue'));
            }
        } catch (error) {
            alert('Erreur de connexion. Veuillez vérifier que le serveur fonctionne et réessayer.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                Soumettre la Demande
            `;
        }
    });

    // --- Smooth field focus animations ---
    document.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('focus', function () {
            this.closest('.form-group')?.classList.add('focused');
        });
        field.addEventListener('blur', function () {
            this.closest('.form-group')?.classList.remove('focused');
        });
    });

    // --- Clear individual field errors on input ---
    document.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('input', function () {
            clearError(this.id);
        });
        field.addEventListener('change', function () {
            clearError(this.id);
        });
    });

});
