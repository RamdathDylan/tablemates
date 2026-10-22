import type { Email } from './types';

// Inline styles only: most email clients strip <style> blocks. Colors match the design tokens.
export function verificationEmail(to: string, name: string, code: string): Email {
  const digits = code.split('').join(' ');
  return {
    to,
    subject: `${code} is your TableMates code`,
    text: `Hi ${name},\n\nYour TableMates verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't sign up, you can ignore this email.`,
    html: `<!doctype html>
<html><body style="margin:0;background:#FAF8F6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1C1A18">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E7E2DC;border-radius:16px;padding:32px">
        <tr><td style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#C23A22">TableMates</td></tr>
        <tr><td style="padding-top:24px;font-size:16px;line-height:24px">Hi ${escapeHtml(name)}, enter this code in the app to verify your email:</td></tr>
        <tr><td align="center" style="padding:24px 0">
          <div style="display:inline-block;background:#FFF1EE;color:#742316;border-radius:10px;padding:16px 24px;font-size:32px;font-weight:700;letter-spacing:6px;font-family:Menlo,Consolas,monospace" aria-label="${code}">${digits}</div>
        </td></tr>
        <tr><td style="font-size:14px;line-height:20px;color:#5E5650">The code expires in 15 minutes. If you didn't sign up for TableMates, you can ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
