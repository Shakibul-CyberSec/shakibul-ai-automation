#!/usr/bin/env python3
"""
NexusFlow AI — Automated Outbound Email Sender
Features:
- Spacemail SSL SMTP Integration (Port 465)
- Humanized Random Delays (120 - 300 seconds)
- Prevents duplicate sends by maintaining sent_log.json
- High-inbox deliverability HTML + Plaintext multi-part emails
"""

import os
import sys
import json
import time
import random
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Auto-load .env.local if present
def _load_env():
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_file):
        with open(env_file, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k not in os.environ:
                    os.environ[k] = v

_load_env()

SMTP_HOST = "mail.spacemail.com"
SMTP_PORT = 465
SENDER_EMAIL = os.getenv("EMAIL_USER", "contact@shakibul.com")
SENDER_PASSWORD = os.getenv("EMAIL_PASSWORD")

if not SENDER_PASSWORD:
    print("[!] EMAIL_PASSWORD environment variable is not set in .env.local.")
    sys.exit(1)

LEADS_FILE = os.path.join(os.path.dirname(__file__), "leads.json")
LOG_FILE = os.path.join(os.path.dirname(__file__), "sent_log.json")

def load_sent_log():
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, "r") as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def save_sent_log(sent_set):
    with open(LOG_FILE, "w") as f:
        json.dump(list(sent_set), f, indent=2)

def create_email_message(lead):
    recipient_name = lead.get("name", "Hiring Manager")
    recipient_email = lead["email"]
    company_name = lead.get("company", "your team")

    # Use custom subject & body if provided in lead object
    subject = lead.get("subject", f"Automating {company_name}'s manual workflows (60-sec demo)")
    
    if "body" in lead:
        plain_text = lead["body"]
        # Convert plain text to simple clean HTML with paragraph breaks and clickable links
        body_html_paragraphs = "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in plain_text.split("\n\n") if p.strip())
        html_text = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b;">
{body_html_paragraphs}
</body>
</html>"""
    else:
        plain_text = f"""Hi {recipient_name},

I noticed that {company_name} is scaling operational workflows.

Manually handling data entry, multi-app syncing, and scheduling across tools usually eats up 15+ hours a week for growing teams.

I built a 60-second live workflow automation demo showing how to eliminate this bottleneck:
1. Auto-processes incoming requests and qualifies criteria.
2. Syncs structured data into Google Sheets / CRMs instantly.
3. Dispatches automated scheduling links and notifications with zero human lag.

You can watch the live 60-second video demo (Google Drive): https://drive.google.com/file/d/1LZDnCcFPvUJGZA77NBR7J3S_ZryAvG-9/view?usp=drive_link

If you'd like a custom pipeline like this configured for {company_name}, just reply directly to this email!

Best regards,

Shakibul Bokhtiar
AI & Workflow Automation Developer
https://shakibul.com | contact@shakibul.com
"""

        html_text = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b;">
<p>Hi <strong>{recipient_name}</strong>,</p>

<p>I noticed that <strong>{company_name}</strong> is scaling operational workflows.</p>

<p>Manually handling data entry, multi-app syncing, and scheduling across tools usually eats up 15+ hours a week for growing teams.</p>

<p>I built a 60-second live workflow automation demo showing how to eliminate this bottleneck:</p>

<ol>
  <li><strong>Auto-Processes Inquiries:</strong> Evaluates incoming criteria instantly using AI.</li>
  <li><strong>2-Way Data Sync:</strong> Instantly logs structured data into Google Sheets or your CRM.</li>
  <li><strong>Automated Scheduling:</strong> Dispatches booking invites and notifications without manual emails.</li>
</ol>

<p>🎬 <strong>Watch the live 60-second video demo (Google Drive):</strong> <a href="https://drive.google.com/file/d/1LZDnCcFPvUJGZA77NBR7J3S_ZryAvG-9/view?usp=drive_link" style="color: #06b6d4; font-weight: bold;">https://drive.google.com/file/d/1LZDnCcFPvUJGZA77NBR7J3S_ZryAvG-9/view?usp=drive_link</a></p>

<p>If you'd like a custom pipeline like this configured for <strong>{company_name}</strong>, just reply directly to this email!</p>

<br>
<p>Best regards,</p>
<p><strong>Shakibul Bokhtiar</strong><br>
AI & Workflow Automation Developer<br>
🌐 <a href="https://shakibul.com" style="color: #06b6d4;">shakibul.com</a> | ✉️ <a href="mailto:contact@shakibul.com" style="color: #06b6d4;">contact@shakibul.com</a></p>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f'"Shakibul Bokhtiar" <{SENDER_EMAIL}>'
    msg["To"] = recipient_email
    msg["Reply-To"] = SENDER_EMAIL

    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_text, "html"))

    return msg

def send_outreach_campaign(leads_filepath=None):
    if leads_filepath is None:
        leads_filepath = sys.argv[1] if len(sys.argv) > 1 else LEADS_FILE

    if not os.path.exists(leads_filepath):
        print(f"[!] Leads file not found at {leads_filepath}.")
        return

    with open(leads_filepath, "r") as f:
        leads = json.load(f)

    is_test_run = "test" in os.path.basename(leads_filepath).lower()
    sent_log = load_sent_log()
    
    # Filter out already sent emails unless it's a test run
    if is_test_run:
        pending_leads = leads
    else:
        pending_leads = [l for l in leads if l["email"].lower() not in sent_log]

    if not pending_leads:
        print("✅ All leads have already been contacted!")
        return

    print(f"🚀 Starting Shakibul Bokhtiar Outbound Campaign ({len(pending_leads)} leads from {os.path.basename(leads_filepath)})...")
    print(f"📧 Sending via {SENDER_EMAIL} (SMTP: {SMTP_HOST}:{SMTP_PORT})\n")

    server = None
    try:
        print(f"🔒 Connecting to SSL {SMTP_HOST}:465...")
        server = smtplib.SMTP_SSL(SMTP_HOST, 465, timeout=30)
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        print("🔒 SSL SMTP Authentication successful!\n")
    except Exception as e_ssl:
        print(f"⚠️ SSL 465 failed ({e_ssl}), trying TLS 587...")
        try:
            server = smtplib.SMTP(SMTP_HOST, 587, timeout=30)
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            print("🔒 TLS SMTP Authentication successful!\n")
        except Exception as e_tls:
            print(f"❌ Failed to connect to SMTP server: {e_tls}")
            return

    try:
        for idx, lead in enumerate(pending_leads, 1):
            email = lead["email"].lower()
            print(f"[{idx}/{len(pending_leads)}] Sending to {lead.get('name', '')} ({email}) @ {lead.get('company', '')}...")

            msg = create_email_message(lead)
            server.sendmail(SENDER_EMAIL, [email], msg.as_string())

            sent_log.add(email)
            save_sent_log(sent_log)
            print(f"   ✅ Sent successfully at {datetime.now().strftime('%H:%M:%S')}")

            if idx < len(pending_leads):
                if is_test_run:
                    delay = 5
                    print(f"   ⏳ [TEST MODE] Short 5s delay before next test email...\n")
                else:
                    delay = random.randint(120, 300) # 2 to 5 minutes random sleep delay
                    minutes = round(delay / 60, 1)
                    print(f"   ⏳ Waiting {minutes} minutes ({delay}s) for humanized inbox delivery protection...\n")
                time.sleep(delay)

    except KeyboardInterrupt:
        print("\n⏹️ Campaign paused by user.")
    except Exception as err:
        print(f"\n❌ Error during campaign run: {err}")
    finally:
        try:
            server.quit()
        except Exception:
            pass
        print("\n🏁 Session closed. Sent log saved.")

if __name__ == "__main__":
    send_outreach_campaign()
