function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function locationPhrase(city) {
  if (!city) return '';
  return ` στην ${city}`;
}

/**
 * Builds a personalized cold outreach email for a lead.
 * Goal: book a short call or in-person meeting. No pricing in the email.
 * Greek copy, short and human to avoid spam filters. Includes unsubscribe.
 */
function buildColdEmail(lead, step = 1) {
  const company = lead.company_name || 'την επιχείρησή σας';
  const city = lead.city || '';
  const sender = process.env.EMAIL_FROM_NAME || 'Νίκος Λαλιώτης';
  const phone = process.env.CONTACT_PHONE || '';

  const subjects = {
    1: `${company}: ιστοσελίδα + Google`,
    2: `${company}, μια σκέψη ακόμα`,
    3: `Να το κλείσουμε εδώ, ${company};`,
  };
  const subject = subjects[step] || subjects[1];

  const bodies = {
    1: [
      `Είδα την επιχείρησή σας${locationPhrase(city)} στο Google και πρόσεξα ότι δεν εμφανίζεται με δική της ιστοσελίδα.`,
      `Βοηθάω τοπικές επιχειρήσεις να φτιάξουν μια καθαρή ιστοσελίδα και ένα σωστό προφίλ στο Google, ώστε να τις βρίσκουν πιο εύκολα οι πελάτες που ήδη ψάχνουν στην περιοχή.`,
      `Θα ήθελα να σας δείξω σύντομα κάποιες ιδέες. Έχετε 10 λεπτά για ένα τηλεφώνημα ή να περάσω από κοντά αυτή την εβδομάδα;`,
    ],
    2: [
      `Σας έγραψα τις προάλλες σχετικά με την ιστοσελίδα και το Google προφίλ για την ${company}.`,
      `Πολλοί πελάτες σας πιθανότατα σας ψάχνουν online πριν έρθουν. Μια απλή, γρήγορη σελίδα κάνει μεγάλη διαφορά σε αυτό.`,
      `Σας βολεύει ένα σύντομο τηλεφώνημα μέσα στην εβδομάδα; Πείτε μου μια μέρα και ώρα που σας ταιριάζει.`,
    ],
    3: [
      `Δεν θέλω να σας ενοχλώ άλλο, οπότε αυτό είναι το τελευταίο μου μήνυμα.`,
      `Αν σας ενδιαφέρει μια ιστοσελίδα και καλύτερη εμφάνιση στο Google για την ${company}, χαρά μου να τα πούμε.`,
      `Αν όχι, όλα καλά — απλώς απαντήστε και δεν θα ξαναγράψω.`,
    ],
  };
  const paras = bodies[step] || bodies[1];

  const signature = phone ? `${sender}\n${phone}` : `${sender}`;

  const text = `Καλησπέρα,

${paras.join('\n\n')}

${signature}`;

  const htmlParas = paras.map((p) => `    <p style="margin:0 0 14px;">${escapeHtml(p)}</p>`).join('\n');
  const htmlSignature = phone ? `${escapeHtml(sender)}<br/>${escapeHtml(phone)}` : `${escapeHtml(sender)}`;

  const html = `<!DOCTYPE html>
<html lang="el">
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;line-height:1.6;font-size:15px;max-width:540px;margin:0 auto;padding:24px;">
    <p style="margin:0 0 14px;">Καλησπέρα,</p>
${htmlParas}
    <p style="margin:22px 0 0;">${htmlSignature}</p>
  </div>
</body>
</html>`;

  return { subject, text, html, template: `cold-email-step-${step}` };
}

module.exports = { buildColdEmail };
