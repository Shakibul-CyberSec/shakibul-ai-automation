import { NextResponse } from 'next/server';
import validator from 'validator';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Secure sanitization function — strips tags first, then attributes
const sanitizeInput = (input: any, options: { ALLOWED_TAGS?: string[] } = {}) => {
  if (!input) return '';
  
  let sanitized = String(input);
  
  if (!options.ALLOWED_TAGS || options.ALLOWED_TAGS.length === 0) {
    sanitized = sanitized.replace(/<[^>]*>?/g, '');
  } else {
    const allowedTags = options.ALLOWED_TAGS.join('|');
    const disallowedTagRegex = new RegExp(`<(?!\\/?(${allowedTags})\\b)[^>]*>?`, 'gi');
    sanitized = sanitized.replace(disallowedTagRegex, '');

    const attrStripRegex = new RegExp(`<(\\/?(?:${allowedTags}))[\\s/][^>]*>`, 'gi');
    sanitized = sanitized.replace(attrStripRegex, '<$1>');
  }

  let prev;
  do {
    prev = sanitized;
    sanitized = sanitized
      .replace(/javascript\s*:/gi, '')
      .replace(/vbscript\s*:/gi, '')
      .replace(/data\s*:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  } while (sanitized !== prev);

  return sanitized;
};

// Honeypot fields
const HONEYPOT_FIELDS = ['website', 'phone_number', 'honey_company'];

/* ---------- UPSTASH REDIS / IN-MEMORY RATE LIMITING ---------- */
let kv: any = null;
let kvAvailable = false;

// Initialize Upstash Redis if env exists
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const { Redis } = require('@upstash/redis');
    kv = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    kvAvailable = true;
  } catch (error) {
    kvAvailable = false;
  }
}

const emailTrackerMemory = new Map<string, any>();
const emailBannedMemory = new Set<string>();

const EMAIL_LIMITS = {
  MAX_REQUESTS_PER_HOUR: 3,
  MAX_REQUESTS_PER_DAY: 5,
  BAN_THRESHOLD: 10
};

async function getEmailInfo(email: string) {
  if (!kvAvailable || !kv) return emailTrackerMemory.get(email) || null;
  try {
    return await kv.get('email:' + email);
  } catch (error) {
    return emailTrackerMemory.get(email) || null;
  }
}

async function setEmailInfo(email: string, info: any) {
  if (!kvAvailable || !kv) {
    emailTrackerMemory.set(email, info);
    return;
  }
  try {
    await kv.set('email:' + email, info, { ex: 7 * 24 * 60 * 60 });
    emailTrackerMemory.set(email, info);
  } catch (error) {
    emailTrackerMemory.set(email, info);
  }
}

async function isEmailBanned(email: string) {
  if (!kvAvailable || !kv) return emailBannedMemory.has(email);
  try {
    const banned = await kv.get('email_ban:' + email);
    if (banned) emailBannedMemory.add(email);
    return !!banned;
  } catch (error) {
    return emailBannedMemory.has(email);
  }
}

async function banEmail(email: string) {
  if (!kvAvailable || !kv) {
    emailBannedMemory.add(email);
    return;
  }
  try {
    await kv.set('email_ban:' + email, true, { ex: 30 * 24 * 60 * 60 });
    emailBannedMemory.add(email);
  } catch (error) {
    emailBannedMemory.add(email);
  }
}

async function trackEmailRequest(email: string, now: number) {
  const info = (await getEmailInfo(email)) || {
    requests: [],
    totalRequests: 0,
    firstSeen: now,
    lastSeen: now
  };
  
  info.requests.push(now);
  info.totalRequests++;
  info.lastSeen = now;
  info.requests = info.requests.filter((t: number) => now - t < 24 * 60 * 60 * 1000);
  
  await setEmailInfo(email, info);
  
  if (info.totalRequests >= EMAIL_LIMITS.BAN_THRESHOLD) {
    await banEmail(email);
  }
  return info;
}

async function isEmailRateLimited(email: string, now: number) {
  const info = await getEmailInfo(email);
  if (!info) return false;
  
  const recentRequests = info.requests.filter((t: number) => now - t < 60 * 60 * 1000);
  const todayRequests = info.requests.filter((t: number) => now - t < 24 * 60 * 60 * 1000);
  
  if (recentRequests.length >= EMAIL_LIMITS.MAX_REQUESTS_PER_HOUR) {
    return { limited: true, reason: 'hour', count: recentRequests.length };
  }
  if (todayRequests.length >= EMAIL_LIMITS.MAX_REQUESTS_PER_DAY) {
    return { limited: true, reason: 'day', count: todayRequests.length };
  }
  return false;
}

// Space Mail configuration
const EMAIL_CONFIG: any = {
  host: 'mail.spacemail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || 'contact@shakibul.com',
    pass: process.env.EMAIL_PASSWORD,
  },
  pool: true,
  maxConnections: 5,
};

const createTransporter = () => {
  return nodemailer.createTransport(EMAIL_CONFIG);
};

const getClientIP = (req: Request) => {
  const vercelIP = req.headers.get('x-vercel-forwarded-for');
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  const realIP = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');

  return vercelIP?.split(',')[0]?.trim() ||
         cfConnectingIP ||
         realIP ||
         xForwardedFor?.split(',')[0]?.trim() ||
         'unknown-ip';
};

const detectSpamPatterns = (message: string) => {
  const spamKeywords = [
    'viagra', 'cialis', 'lottery', 'winner', 'claim your prize',
    'click here now', 'limited time offer', 'act now', 'free money',
    'nigerian prince', 'inheritance', 'casino', 'poker', 'crypto wallet',
    'bitcoin', 'make money fast'
  ];
  const lowerMessage = message.toLowerCase();
  return spamKeywords.some(keyword => lowerMessage.includes(keyword));
};

const checkHoneypot = (body: any) => {
  for (const field of HONEYPOT_FIELDS) {
    if (body[field] && String(body[field]).trim().length > 0) {
      return true;
    }
  }
  return false;
};

// Turnstile Cloudflare CAPTCHA
const verifyTurnstile = async (token: string, ip: string) => {
  if (!process.env.TURNSTILE_SECRET_KEY) return { success: true };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip
      })
    });
    const data = await res.json();
    return { success: !!data.success };
  } catch (err) {
    return { success: false };
  }
};

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().substring(0, 8);
  const ip = getClientIP(req);
  const now = Date.now();

  try {
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    // Honeypot check
    if (checkHoneypot(requestBody)) {
      return NextResponse.json({
        success: true,
        message: "Thank you for reaching out! Your message has been sent successfully."
      });
    }

    const { name, email, company, message, captchaToken } = requestBody;

    // Email format validation
    const trimmedEmail = email?.toString().trim().toLowerCase();
    if (!trimmedEmail || !validator.isEmail(trimmedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid business email address.' },
        { status: 400 }
      );
    }

    // Email rate limiting & ban checks
    if (await isEmailBanned(trimmedEmail)) {
      return NextResponse.json({
        success: true,
        message: "Thank you for reaching out! Your message has been sent successfully."
      });
    }

    const emailLimit = await isEmailRateLimited(trimmedEmail, now);
    if (emailLimit) {
      const msg = emailLimit.reason === 'hour'
        ? `You've sent ${emailLimit.count} messages in the past hour. Please wait before sending another.`
        : `Daily message limit reached. Please try again tomorrow.`;
      return NextResponse.json({ error: msg }, { status: 429 });
    }

    // Turnstile verification if captcha token sent or secret present
    if (captchaToken && process.env.TURNSTILE_SECRET_KEY) {
      const captchaVerif = await verifyTurnstile(captchaToken, ip);
      if (!captchaVerif.success) {
        return NextResponse.json({ error: 'Security verification failed. Please try again.' }, { status: 403 });
      }
    }

    // Required fields check
    if (!name || !trimmedEmail || !message) {
      return NextResponse.json(
        { error: 'Please fill in all required fields (Name, Email, and Message).' },
        { status: 400 }
      );
    }

    // Field length checks
    if (name.length > 80) {
      return NextResponse.json({ error: 'Name is too long (max 80 chars).' }, { status: 400 });
    }
    if (message.length < 10) {
      return NextResponse.json({ error: 'Message is too short (min 10 chars).' }, { status: 400 });
    }
    if (message.length > 3000) {
      return NextResponse.json({ error: 'Message is too long (max 3000 chars).' }, { status: 400 });
    }

    // Spam pattern detection
    if (detectSpamPatterns(message)) {
      await banEmail(trimmedEmail);
      return NextResponse.json({
        success: true,
        message: "Thank you for reaching out! Your message has been sent successfully."
      });
    }

    await trackEmailRequest(trimmedEmail, now);

    // Input sanitization
    const sanitizedData = {
      name: sanitizeInput(name),
      email: trimmedEmail,
      company: company ? sanitizeInput(company) : 'N/A',
      message: sanitizeInput(message, { ALLOWED_TAGS: ['br', 'p'] })
    };

    const recipientEmail = process.env.EMAIL_USER || 'contact@shakibul.com';
    const emailSubject = `🚀 New Client Request: ${sanitizedData.company !== 'N/A' ? sanitizedData.company : sanitizedData.name}`;

    const plainText = `New Automation Project Request

Name: ${sanitizedData.name}
Email: ${sanitizedData.email}
Company: ${sanitizedData.company}
Submitted: ${new Date().toLocaleString()}
Request ID: ${requestId}

Workflow Request / Message:
${sanitizedData.message}

---
This message was sent from your AI Systems website contact form.
Reply directly to ${sanitizedData.name} by clicking "Reply".`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }
    .header { color: #06b6d4; border-bottom: 2px solid #06b6d4; padding-bottom: 16px; margin-bottom: 24px; }
    .field { margin-bottom: 12px; }
    .field strong { color: #475569; min-width: 90px; display: inline-block; }
    .message-box { background-color: #f1f5f9; padding: 20px; border-left: 4px solid #06b6d4; border-radius: 8px; margin-top: 12px; font-size: 15px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h2 class="header">⚡ New AI Automation Project Request</h2>
    
    <div className="field"><strong>Name:</strong> ${validator.escape(sanitizedData.name)}</div>
    <div className="field"><strong>Email:</strong> <a href="mailto:${validator.escape(sanitizedData.email)}" style="color: #06b6d4;">${validator.escape(sanitizedData.email)}</a></div>
    <div className="field"><strong>Company:</strong> ${validator.escape(sanitizedData.company)}</div>
    <div className="field"><strong>Submitted:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} (BD Time)</div>
    <div className="field" style="font-size: 11px; color: #94a3b8;">Request ID: ${requestId}</div>

    <h3 style="margin-top: 24px; color: #334155;">Workflow / Problem Description</h3>
    <div class="message-box">
      ${validator.escape(sanitizedData.message).replace(/\n/g, '<br>')}
    </div>
    
    <div class="footer">
      <p>Sent from your website <strong>NEXUSFLOW.AI</strong> contact form.</p>
      <p>Click "Reply" in your email client to respond directly to ${sanitizedData.name}.</p>
    </div>
  </div>
</body>
</html>`;

    if (!process.env.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD.trim() === '') {
      // Development mode log if password not configured yet
      console.log('--- [DEV EMAIL SUBMISSION LOG] ---');
      console.log('To:', recipientEmail);
      console.log('Subject:', emailSubject);
      console.log('From:', sanitizedData.name, `<${sanitizedData.email}>`);
      console.log('Message:', sanitizedData.message);
      console.log('-----------------------------------');

      return NextResponse.json({
        success: true,
        message: "Thank you for reaching out! Your message has been received successfully."
      });
    }

    // Send via Space Mail Nodemailer Transporter
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"NexusFlow AI" <${recipientEmail}>`,
      to: recipientEmail,
      replyTo: `"${sanitizedData.name}" <${sanitizedData.email}>`,
      subject: emailSubject,
      text: plainText,
      html: htmlContent,
      headers: {
        'X-Priority': '3',
        'X-Mailer': 'Node.js/Nodemailer',
        'X-Request-ID': requestId,
      }
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      message: "Thank you for reaching out! Your message has been sent successfully. I'll get back to you within 2 hours."
    });

  } catch (error: any) {
    console.error('[API SendEmail Error]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
