# ED On-Call Dashboard

A static, mobile-friendly Emergency Department rota dashboard using Firebase Realtime Database and Firebase Authentication. The display uses `Asia/Muscat`, shows all nine specialties, and updates in real time.

## Important security model

- No public sign-up is implemented.
- The TV display and editor require an authorized Firebase Authentication account.
- The Firebase database rules require a signed-in account to read rotas.
- A write is allowed only when `editorAccess/{uid}` has `enabled: true` and the assigned `specialty` matches the rota path. The special value `admin` is intended for a trusted administrator.
- The `editorAccess` path cannot be read or written by app clients; configure it through Firebase Console using the Realtime Database Data view.
- Phone numbers are still visible to every authorized account. Only create accounts for staff who are allowed to view the on-call directory.
- Protect the Firebase project owner account with strong authentication. Never put Firebase Admin SDK credentials or service-account JSON in this repository.

## Files

- `index.html` — app shell and page structure.
- `styles.css` — dark dashboard and responsive rota editor.
- `app.js` — Firebase authentication, live display, and monthly editor.
- `firebase-config.example.js` — configuration template.
- `database.rules.json` — database rules to paste/import in Firebase Console.
- `firebase-config.js` — create this locally; it is ignored by Git.

## 1. Create Firebase project

1. Open https://console.firebase.google.com/ and create a project.
2. In **Project settings → General → Your apps**, add a Web app and copy its Firebase configuration.
3. In **Build → Realtime Database**, create a database. Choose the region appropriate for your organization and record its database URL.
4. In **Authentication → Sign-in method**, enable **Email/Password**.
5. In **Authentication → Users**, create accounts for the TV display and each authorized rota editor. There is no public registration flow.
6. In **Realtime Database → Rules**, paste the contents of `database.rules.json` and publish them.
7. In **Realtime Database → Data**, create the access mapping for each user using the user's exact Firebase Authentication UID. Example mappings:
   ```json
   {
     "editorAccess": {
       "TV_ACCOUNT_UID": { "enabled": true, "role": "display" },
       "MEDICINE_EDITOR_UID": { "enabled": true, "role": "editor", "specialty": "medicine" },
       "ADMIN_UID": { "enabled": true, "role": "admin", "specialty": "admin" }
     }
   }
   ```
   Replace these example UID labels with real UIDs. Valid specialty IDs are:
   `medicine`, `surgery`, `paediatrics`, `gynaecology`, `ophthalmology`, `ent`, `dental`, `nephrology`, `psychiatry`.
   A display account is read-only. An editor account can edit only its assigned specialty. An admin account can edit all specialties and should be tightly restricted.
8. Copy `firebase-config.example.js` to `firebase-config.js`, then replace the example values with your Web app's actual `apiKey`, `authDomain`, `databaseURL`, `projectId`, and `appId`.

### Display account permissions

The implementation supports a dedicated read-only display account. Create it in Firebase Authentication, then set its access mapping to `{ "enabled": true, "role": "display" }` in the Realtime Database. It can read rota data but cannot write it. Keep editor accounts separate and map each to exactly one specialty.

## 2. Test locally

Because browser ES modules require HTTP(S), do not open `index.html` by double-clicking it as a `file://` URL. From this directory, run one of:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000/`. This requires Python to be installed. Use the TV display link at `/?view=display`, and the editor link at `/?view=edit&specialty=medicine`.

## 3. Publish with GitHub Pages

1. Create a **private** GitHub repository for the project if your organization's policies allow it. Note that GitHub Pages hosting may be publicly accessible even if the source repository is private, depending on plan and organization settings; do not assume a private repo makes the published site private.
2. Add the app files and the real `firebase-config.js` to the repository only if you choose to commit it. The Firebase web config is not a secret by itself, but database security rules are the actual access control. This starter `.gitignore` omits `firebase-config.js` to prevent accidental configuration sharing. If you keep it untracked, the published site won't work until you inject or add the config through a controlled deployment process. For a first deployment, a simpler alternative is to commit the Firebase web config after confirming restrictive rules; it is not an Admin credential. Never commit service-account credentials.
3. In repository **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, and save.
4. Wait for GitHub Pages to finish deploying. Use the exact URL shown in Settings → Pages; it will be either a user/org site or a project site URL.
5. In Firebase Authentication → Settings → Authorized domains, add the published domain (and `localhost` for local testing if needed).
6. Test sign-in, display reads, authorized editing, and rejected unauthorized writes before placing it on the department TV.

## 4. Use the app

- TV: open the deployed site with `?view=display`, sign in using the authorized display account, then use the browser's full-screen mode.
- Editor: share the deployed site with `?view=edit&specialty=medicine` (replace the specialty ID as needed). The URL selects the specialty; Firebase rules are what actually authorize editing.
- Use full names and verified phone numbers. The dashboard deliberately does not generate sample doctors or phone numbers.
- The app stores daily entries by `YYYY-MM` month and `DD` day, uses Oman local date/time for the current display, and highlights the current day in the editor.

## Production checklist

- [ ] Confirm Firebase rules are published and deny unauthenticated reads/writes.
- [ ] Add separate accounts for authorized editors.
- [ ] Configure read-only display role/rules before real clinical use.
- [ ] Confirm all nine specialty names and IDs match local practice.
- [ ] Test a month boundary and a leap-year February.
- [ ] Test an empty day and an updated phone number.
- [ ] Verify the TV remains signed in and reconnects after Wi-Fi interruption.
- [ ] Obtain local approval before displaying staff contact details on a shared screen.
