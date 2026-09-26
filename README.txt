EXCESS BAGGAGE REPORT — LOCALSTORAGE VERSION

This version does NOT use Supabase. Accounts and reports are stored in the browser's localStorage.

How to use:
1. Open index.html in your browser, or upload it to GitHub Pages.
2. Create a normal account using Create Account.
3. Sign in and create reports. Reports are saved automatically in that browser.
4. The Supervisor dashboard can see reports saved by all accounts in the same browser.
5. Default Supervisor account:
   User ID: 37888
   Password: 37888@

Important:
- localStorage is browser/device-specific. Data does not automatically appear on another computer or phone.
- Clearing browser/site data can delete the local accounts and reports.
- The password is protected with a browser-side SHA-256 hash, but this is NOT a secure server authentication system.
- When you are ready for multi-device/online storage, we can replace this storage layer with Supabase without rebuilding the report parser.
