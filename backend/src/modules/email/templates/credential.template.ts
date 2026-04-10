export function credentialTemplate(p: {
  candidateName: string, role: string, campaignName: string,
  email: string, tempPassword: string, loginUrl: string,
  downloadUrl: string
}): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#374151">
  <div style="background:linear-gradient(135deg,#FB851E,#FB371E);padding:24px;border-radius:12px;margin-bottom:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px">Assessment Invitation</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">${p.role}</p>
  </div>

  <p>Hi ${p.candidateName},</p>
  <p>You have been invited to complete the technical assessment for the <strong>${p.role}</strong> position at <strong>${p.campaignName}</strong>.</p>
  
  <div style="background:#fff7ed;border:1px solid #ffedd5;border-radius:12px;padding:24px;margin:24px 0">
    <h3 style="margin:0 0 12px;color:#92400e">🚀 Pre-Assessment Readiness</h3>
    <p style="margin:0 0 16px;font-size:14px">To ensure a smooth experience, please verify your system meets these <strong>Military Grade</strong> security requirements before starting:</p>
    
    <table style="width:100%;font-size:13px;color:#4b5563;border-collapse:collapse">
      <tr style="border-bottom:1px solid #fed7aa">
        <td style="padding:8px 0;font-weight:600;width:140px">Operating System:</td>
        <td style="padding:8px 0">Windows 10/11 (64-bit) or macOS 10.15+</td>
      </tr>
      <tr style="border-bottom:1px solid #fed7aa">
        <td style="padding:8px 0;font-weight:600">Hardware:</td>
        <td style="padding:8px 0">Working Webcam, Microphone & Single Monitor</td>
      </tr>
      <tr style="border-bottom:1px solid #fed7aa">
        <td style="padding:8px 0;font-weight:600">Network:</td>
        <td style="padding:8px 0">Stable Internet (5 Mbps+) • No VPN/Proxy</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-weight:600">Locked Apps:</td>
        <td style="padding:8px 0">Close Zoom, Teams, AnyDesk & Screen Recorders</td>
      </tr>
    </table>

    <div style="margin-top:24px;padding-top:16px;border-top:2px dashed #fed7aa;text-align:center">
       <p style="font-size:13px;font-weight:bold;color:#FB851E;margin-bottom:12px">STEP 1: CHOOSE YOUR ASSESSMENT MODE</p>
       
       <div style="margin-bottom:20px">
         <p style="font-size:13px;margin-bottom:10px"><strong>Option A: Premium Web Experience (Recommended)</strong></p>
         <a href="${p.loginUrl}" style="background:#FB851E;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;box-shadow:0 4px 12px rgba(251,133,30,0.3)">
           Start in Browser
         </a>
         <p style="font-size:11px;color:#6b7280;margin-top:6px">No installation required • Works in Chrome/Edge/Safari</p>
       </div>

       <div style="background:rgba(251,133,30,0.05);padding:16px;border-radius:12px">
         <p style="font-size:13px;margin:0 0 10px"><strong>Option B: Secure Desktop App</strong></p>
         <a href="${p.downloadUrl}" style="background:#4b5563;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:bold;display:inline-block;margin:4px">
           Windows (.exe)
         </a>
         <a href="${p.downloadUrl.replace('.exe', '.dmg')}" style="background:#4b5563;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:bold;display:inline-block;margin:4px">
           Mac (.dmg)
         </a>
         <p style="font-size:11px;color:#6b7280;margin-top:6px">Recommended for unstable internet or strict security compliance</p>
       </div>
    </div>
  </div>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:24px 0">
    <h3 style="margin:0 0 16px;color:#111827">Your Access Credentials</h3>
    <table style="width:100%">
      <tr>
        <td style="padding:4px 0;width:120px;font-weight:600;color:#6b7280">Login URL:</td>
        <td style="padding:4px 0"><a href="${p.loginUrl}" style="color:#FB851E;text-decoration:none;font-weight:500">${p.loginUrl}</a></td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-weight:600;color:#6b7280">Username:</td>
        <td style="padding:4px 0;font-family:monospace;background:#f3f4f6;padding-left:8px;border-radius:4px">${p.email}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-weight:600;color:#6b7280">Temporary Password:</td>
        <td style="padding:4px 0;font-family:monospace;background:#f3f4f6;padding-left:8px;border-radius:4px">${p.tempPassword}</td>
      </tr>
    </table>
  </div>

  <p style="font-size:14px">Please complete the assessment in one sitting. Your session will be proctored via camera and microphone. You will be asked to change your password upon your first login.</p>
  
  <hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0">
  <p style="color:#9ca3af;font-size:12px;text-align:center">Indium AI — Automated Assessment System</p>
</body></html>`
}
